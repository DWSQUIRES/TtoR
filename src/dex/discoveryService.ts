import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { PostRepository } from "../repository.js";
import type { DexDiscoveryRunInput } from "../types.js";
import type { DexScreenerClient, DexScreenerPair } from "./dexScreenerClient.js";
import { normalizeDexPairs } from "./scoring.js";
import { buildDexDiscoveryQueryTerms } from "./queryTerms.js";

export interface DexDiscoveryRunSummary {
  analyzedSignalCount: number;
  candidateCount: number;
  errorCount: number;
}

export class DexDiscoveryService {
  public constructor(
    private readonly config: Pick<
      AppConfig,
      | "dexDiscoveryMinSignalScore"
      | "dexDiscoveryMaxSignalsPerRun"
      | "dexDiscoveryMaxQueriesPerSignal"
      | "dexDiscoveryCacheTtlMinutes"
      | "dexDiscoveryMinLiquidityUsd"
      | "dexDiscoveryMinVolume24hUsd"
    >,
    private readonly repository: PostRepository,
    private readonly dexScreener: DexScreenerClient,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async discoverPendingSignals(): Promise<DexDiscoveryRunSummary> {
    const signals = await this.repository.getSignalsPendingDexDiscovery({
      minScore: this.config.dexDiscoveryMinSignalScore,
      limit: this.config.dexDiscoveryMaxSignalsPerRun,
      ttlMinutes: this.config.dexDiscoveryCacheTtlMinutes
    });
    let analyzedSignalCount = 0;
    let candidateCount = 0;
    let errorCount = 0;

    for (const signal of signals) {
      const startedAt = this.now().toISOString();

      try {
        const terms = buildDexDiscoveryQueryTerms(signal, this.config.dexDiscoveryMaxQueriesPerSignal);
        const pairs: DexScreenerPair[] = [];
        for (const term of terms) {
          pairs.push(...await this.dexScreener.searchPairs(term));
        }

        const candidates = normalizeDexPairs(signal, terms, pairs, {
          minLiquidityUsd: this.config.dexDiscoveryMinLiquidityUsd,
          minVolume24hUsd: this.config.dexDiscoveryMinVolume24hUsd,
          now: this.now()
        });
        await this.repository.upsertDexTokenCandidates(signal.postId, candidates);
        await this.repository.saveDexDiscoveryRun({
          postId: signal.postId,
          status: "success",
          startedAt,
          finishedAt: this.now().toISOString(),
          signalCount: 1,
          candidateCount: candidates.length,
          errorCount: 0,
          metadata: {
            queryTerms: terms
          }
        });

        analyzedSignalCount += 1;
        candidateCount += candidates.length;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown DEX discovery error";
        const run: DexDiscoveryRunInput = {
          postId: signal.postId,
          status: "error",
          startedAt,
          finishedAt: this.now().toISOString(),
          signalCount: 1,
          candidateCount: 0,
          errorCount: 1,
          errorMessage: message
        };
        await this.repository.saveDexDiscoveryRun(run);
        errorCount += 1;
        this.logger.warn("DEX discovery failed for signal", {
          postId: signal.postId,
          message
        });
      }
    }

    return {
      analyzedSignalCount,
      candidateCount,
      errorCount
    };
  }
}
