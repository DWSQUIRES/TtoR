import { describe, expect, it, vi } from "vitest";

import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { Repository } from "../storage.js";
import type { MemeSignalAnalysisPayload, NormalizedPost } from "../types.js";
import type { DexScreenerClient } from "./dexScreenerClient.js";
import { DexDiscoveryService } from "./discoveryService.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const config: Pick<
  AppConfig,
  | "dexDiscoveryMinSignalScore"
  | "dexDiscoveryMaxSignalsPerRun"
  | "dexDiscoveryMaxQueriesPerSignal"
  | "dexDiscoveryCacheTtlMinutes"
  | "dexDiscoveryMinLiquidityUsd"
  | "dexDiscoveryMinVolume24hUsd"
> = {
  dexDiscoveryMinSignalScore: 70,
  dexDiscoveryMaxSignalsPerRun: 5,
  dexDiscoveryMaxQueriesPerSignal: 8,
  dexDiscoveryCacheTtlMinutes: 30,
  dexDiscoveryMinLiquidityUsd: 5000,
  dexDiscoveryMinVolume24hUsd: 1000
};

function createPost(postId: string): NormalizedPost {
  return {
    postId,
    authorHandle: "polymarket",
    authorDisplayName: "Polymarket",
    createdAt: "2026-05-15T10:00:00.000Z",
    detectedAt: "2026-05-15T10:00:05.000Z",
    text: "Concrete skull recovered",
    lang: "en",
    conversationId: postId,
    replyToPostId: null,
    quotedPostId: null,
    isRepost: false,
    media: [],
    rawPayload: {}
  };
}

const analysis: MemeSignalAnalysisPayload = {
  hasMemecoinSignal: true,
  signalScore: 91,
  confidence: "high",
  narrative: "Concrete skull recovered",
  whySignal: "Short bizarre visual phrase.",
  searchTerms: ["concrete skull"],
  possibleNames: [
    {
      name: "Concrete Skull",
      ticker: "SKULL",
      priority: 95,
      reason: "Direct match."
    }
  ],
  entities: [],
  urgency: "high",
  sensitivityFlags: [],
  recommendedAction: "urgent_search"
};

describe("DexDiscoveryService", () => {
  it("searches pending signals and stores candidates", async () => {
    const repository = Repository.open(":memory:");
    repository.recordPollRun({
      startedAt: "2026-05-15T10:00:00.000Z",
      finishedAt: "2026-05-15T10:00:05.000Z",
      status: "success",
      posts: [createPost("post-1")]
    });
    repository.saveMemeSignalAnalysis({
      postId: "post-1",
      status: "success",
      model: "test",
      promptVersion: "test",
      analysis,
      createdAt: "2026-05-15T10:00:06.000Z"
    });

    const client: DexScreenerClient = {
      searchPairs: vi.fn(async () => [
        {
          chainId: "solana",
          dexId: "raydium",
          pairAddress: "pair-1",
          url: "https://dexscreener.com/solana/pair-1",
          baseToken: {
            address: "token-1",
            name: "Concrete Skull",
            symbol: "SKULL"
          },
          liquidity: {
            usd: 25_000
          },
          volume: {
            h24: 50_000
          },
          pairCreatedAt: Date.parse("2026-05-15T09:00:00.000Z")
        }
      ])
    };
    const service = new DexDiscoveryService(
      config,
      repository,
      client,
      silentLogger,
      () => new Date("2026-05-15T10:00:10.000Z")
    );

    await expect(service.discoverPendingSignals()).resolves.toMatchObject({
      analyzedSignalCount: 1,
      candidateCount: 1,
      errorCount: 0
    });
    expect(repository.getDexDiscoveryForPost("post-1")).toMatchObject([
      {
        postId: "post-1",
        baseTokenSymbol: "SKULL"
      }
    ]);

    repository.close();
  });
});
