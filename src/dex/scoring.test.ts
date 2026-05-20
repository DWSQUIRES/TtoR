import { describe, expect, it } from "vitest";

import type { MemeSignalAnalysisRecord } from "../types.js";
import type { DexScreenerPair } from "./dexScreenerClient.js";
import { normalizeDexPairs } from "./scoring.js";

const signal: MemeSignalAnalysisRecord = {
  postId: "post-1",
  status: "success",
  model: "test",
  promptVersion: "test",
  rawPayload: {},
  errorMessage: null,
  createdAt: "2026-05-15T10:00:00.000Z",
  hasMemecoinSignal: true,
  signalScore: 90,
  confidence: "high",
  narrative: "Concrete skull recovered",
  whySignal: "Short bizarre visual phrase.",
  searchTerms: ["concrete skull"],
  possibleNames: [],
  entities: [],
  urgency: "high",
  sensitivityFlags: [],
  recommendedAction: "urgent_search"
};

describe("normalizeDexPairs", () => {
  it("filters, scores, and flags DexScreener pairs", () => {
    const pairs: DexScreenerPair[] = [
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
        quoteToken: {
          symbol: "SOL"
        },
        priceUsd: "0.001",
        liquidity: {
          usd: 50_000
        },
        volume: {
          h24: 150_000
        },
        fdv: 2_000_000,
        marketCap: 1_500_000,
        pairCreatedAt: Date.parse("2026-05-15T09:00:00.000Z"),
        info: {
          socials: [{ type: "twitter", url: "https://x.com/skull" }]
        }
      },
      {
        chainId: "solana",
        dexId: "raydium",
        pairAddress: "pair-2",
        url: "https://dexscreener.com/solana/pair-2",
        baseToken: {
          address: "token-2",
          name: "Unrelated",
          symbol: "NOPE"
        },
        liquidity: {
          usd: 100_000
        },
        volume: {
          h24: 100_000
        }
      }
    ];

    const candidates = normalizeDexPairs(signal, ["concrete skull", "skull"], pairs, {
      minLiquidityUsd: 5000,
      minVolume24hUsd: 1000,
      now: new Date("2026-05-15T10:00:00.000Z")
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      postId: "post-1",
      chainId: "solana",
      pairAddress: "pair-1",
      baseTokenSymbol: "SKULL",
      matchedTerms: ["concrete skull", "skull"]
    });
    expect(candidates[0].matchScore).toBeGreaterThan(70);
    expect(candidates[0].riskFlags).toContain("new_pair");
  });
});
