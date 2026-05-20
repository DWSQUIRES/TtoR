import { describe, expect, it } from "vitest";

import { Repository } from "./storage.js";
import type { DexTokenCandidateInput, MemeSignalAnalysisPayload, NormalizedPost } from "./types.js";

function createPost(postId: string, detectedAt: string): NormalizedPost {
  return {
    postId,
    authorHandle: "polymarket",
    authorDisplayName: "Polymarket",
    createdAt: detectedAt,
    detectedAt,
    text: `Post ${postId}`,
    lang: "en",
    conversationId: postId,
    replyToPostId: null,
    quotedPostId: null,
    isRepost: false,
    media: [],
    rawPayload: {
      id: postId
    }
  };
}

describe("Repository", () => {
  it("deduplicates posts while recording poll runs", () => {
    const repository = Repository.open(":memory:");

    const first = repository.recordPollRun({
      startedAt: "2026-05-15T10:00:00.000Z",
      finishedAt: "2026-05-15T10:00:05.000Z",
      status: "success",
      posts: [createPost("2", "2026-05-15T10:00:00.000Z"), createPost("1", "2026-05-15T09:59:00.000Z")]
    });

    const second = repository.recordPollRun({
      startedAt: "2026-05-15T10:01:00.000Z",
      finishedAt: "2026-05-15T10:01:05.000Z",
      status: "success",
      posts: [createPost("2", "2026-05-15T10:00:00.000Z")]
    });

    expect(first).toMatchObject({
      newPostsCount: 2,
      latestPostId: "2"
    });
    expect(second).toMatchObject({
      newPostsCount: 0,
      latestPostId: "2"
    });
    expect(repository.getLatestPost()?.postId).toBe("2");
    expect(repository.getPostsSinceDetectedAt("2026-05-15T09:58:00.000Z")).toHaveLength(2);
    expect(repository.getPostsSinceCreatedAt("2026-05-15T10:00:00.000Z").map((post) => post.postId)).toEqual(["2"]);

    repository.close();
  });

  it("returns latest post by created_at instead of initial detection order", () => {
    const repository = Repository.open(":memory:");

    repository.recordPollRun({
      startedAt: "2026-05-15T10:00:00.000Z",
      finishedAt: "2026-05-15T10:00:05.000Z",
      status: "success",
      posts: [createPost("old", "2026-01-01T00:00:00.000Z")]
    });
    repository.recordPollRun({
      startedAt: "2026-05-15T10:01:00.000Z",
      finishedAt: "2026-05-15T10:01:05.000Z",
      status: "success",
      posts: [createPost("new", "2026-05-15T00:00:00.000Z")]
    });

    expect(repository.getLatestPost()?.postId).toBe("new");

    repository.close();
  });

  it("stores and queries meme signal analyses", () => {
    const repository = Repository.open(":memory:");
    const post = createPost("signal-post", "2026-05-15T10:00:00.000Z");
    const analysis: MemeSignalAnalysisPayload = {
      hasMemecoinSignal: true,
      signalScore: 88,
      confidence: "high",
      narrative: "Concrete skull recovered",
      whySignal: "Short bizarre visual phrase.",
      searchTerms: ["concrete skull", "skull"],
      possibleNames: [
        {
          name: "Concrete Skull",
          ticker: "SKULL",
          priority: 95,
          reason: "Direct phrase match."
        }
      ],
      entities: ["Czech police"],
      urgency: "high",
      sensitivityFlags: ["death-related imagery"],
      recommendedAction: "urgent_search"
    };

    repository.recordPollRun({
      startedAt: "2026-05-15T10:00:00.000Z",
      finishedAt: "2026-05-15T10:00:05.000Z",
      status: "success",
      posts: [post]
    });

    expect(repository.getUnanalyzedPosts(10).map((storedPost) => storedPost.postId)).toEqual(["signal-post"]);

    repository.saveMemeSignalAnalysis({
      postId: post.postId,
      status: "success",
      model: "test-model",
      promptVersion: "test-prompt",
      analysis,
      rawPayload: {
        test: true
      },
      createdAt: "2026-05-15T10:00:06.000Z"
    });

    expect(repository.getUnanalyzedPosts(10)).toHaveLength(0);
    expect(repository.getMemeAnalyses({ status: null, limit: 10 })).toMatchObject([
      {
        postId: "signal-post",
        status: "success"
      }
    ]);
    expect(repository.getMemeAnalyses({ status: "error", limit: 10 })).toHaveLength(0);
    expect(repository.getMemeSignals({ minScore: 70, limit: 10 })).toMatchObject([
      {
        postId: "signal-post",
        signalScore: 88,
        possibleNames: [
          {
            ticker: "SKULL"
          }
        ]
      }
    ]);
    expect(repository.getMemeSignalForPost("signal-post")?.recommendedAction).toBe("urgent_search");

    repository.close();
  });

  it("stores and queries DEX discovery candidates", () => {
    const repository = Repository.open(":memory:");
    const post = createPost("signal-post", "2026-05-15T10:00:00.000Z");
    const analysis: MemeSignalAnalysisPayload = {
      hasMemecoinSignal: true,
      signalScore: 88,
      confidence: "high",
      narrative: "Concrete skull recovered",
      whySignal: "Short bizarre visual phrase.",
      searchTerms: ["concrete skull", "skull"],
      possibleNames: [
        {
          name: "Concrete Skull",
          ticker: "SKULL",
          priority: 95,
          reason: "Direct phrase match."
        }
      ],
      entities: [],
      urgency: "high",
      sensitivityFlags: [],
      recommendedAction: "urgent_search"
    };
    const candidate: DexTokenCandidateInput = {
      postId: post.postId,
      chainId: "solana",
      dexId: "raydium",
      pairAddress: "pair-1",
      baseTokenAddress: "token-1",
      baseTokenName: "Concrete Skull",
      baseTokenSymbol: "SKULL",
      quoteTokenSymbol: "SOL",
      url: "https://dexscreener.com/solana/pair-1",
      priceUsd: 0.001,
      liquidityUsd: 50_000,
      volume24hUsd: 100_000,
      marketCap: 1_000_000,
      fdv: 1_200_000,
      pairCreatedAt: "2026-05-15T09:00:00.000Z",
      matchScore: 91,
      riskFlags: ["new_pair"],
      matchedTerms: ["concrete skull", "skull"],
      rawPayload: {
        pairAddress: "pair-1"
      },
      discoveredAt: "2026-05-15T10:00:10.000Z",
      lastCheckedAt: "2026-05-15T10:00:10.000Z",
      priorityScore: 35,
      priorityReasons: ["strong_volume", "strong_liquidity"]
    };
    const laterCandidate: DexTokenCandidateInput = {
      ...candidate,
      priceUsd: 0.003,
      liquidityUsd: 75_000,
      volume24hUsd: 180_000,
      discoveredAt: "2026-05-15T10:45:10.000Z",
      lastCheckedAt: "2026-05-15T10:45:10.000Z",
      priorityScore: 85,
      priorityReasons: ["price_up_since_last_check", "strong_volume"]
    };
    const secondCandidate: DexTokenCandidateInput = {
      ...candidate,
      pairAddress: "pair-2",
      baseTokenAddress: "token-2",
      baseTokenName: "Other Skull",
      baseTokenSymbol: "OSKULL",
      priceUsd: 0.002,
      discoveredAt: "2026-05-15T10:01:10.000Z",
      lastCheckedAt: "2026-05-15T10:01:10.000Z",
      priorityScore: 10,
      priorityReasons: []
    };

    repository.recordPollRun({
      startedAt: "2026-05-15T10:00:00.000Z",
      finishedAt: "2026-05-15T10:00:05.000Z",
      status: "success",
      posts: [post]
    });
    repository.saveMemeSignalAnalysis({
      postId: post.postId,
      status: "success",
      model: "test-model",
      promptVersion: "test-prompt",
      analysis,
      createdAt: "2026-05-15T10:00:06.000Z"
    });

    expect(repository.getSignalsPendingDexDiscovery({ minScore: 70, limit: 10, ttlMinutes: 30 })).toMatchObject([
      {
        postId: "signal-post"
      }
    ]);
    repository.upsertDexTokenCandidates(post.postId, [candidate]);
    repository.upsertDexTokenCandidates(post.postId, [secondCandidate]);
    repository.upsertDexTokenCandidates(post.postId, [laterCandidate]);
    repository.saveDexDiscoveryRun({
      postId: post.postId,
      status: "success",
      startedAt: "2026-05-15T10:00:10.000Z",
      finishedAt: "2026-05-15T10:00:11.000Z",
      signalCount: 1,
      candidateCount: 1,
      errorCount: 0,
      metadata: {
        queryTerms: ["concrete skull"]
      }
    });

    expect(repository.getDexDiscoveries({ minScore: 70, limit: 10 })[0]).toMatchObject({
      postId: "signal-post",
      baseTokenSymbol: "SKULL",
      matchScore: 91,
      priceUsd: 0.003,
      firstPriceUsd: 0.001,
      previousPriceUsd: 0.001,
      priorityScore: 85,
      priorityReasons: ["price_up_since_last_check", "strong_volume"],
      signalScore: 88,
      narrative: "Concrete skull recovered"
    });
    expect(repository.getDexDiscoveryForPost("signal-post")).toHaveLength(2);
    expect(repository.getDexCandidatesPendingRefresh({ limit: 10, ttlMinutes: 1 })).toHaveLength(2);
    expect(repository.getDexCandidatesPendingRugCheck({ limit: 10, ttlMinutes: 1 })).toHaveLength(2);
    const riskSnapshot = repository.saveDexRugpullRisk({
      postId: post.postId,
      chainId: "solana",
      pairAddress: "pair-1",
      baseTokenAddress: "token-1",
      rugpullScore: 65,
      previousRugpullScore: null,
      rugpullLevel: "high",
      rugpullTrend: "stable",
      rugpullFlags: ["high_fdv_liquidity"],
      rugpullDetails: [
        {
          flag: "high_fdv_liquidity",
          severity: "high",
          points: 20,
          description: "FDV is high compared with liquidity."
        }
      ],
      rawPayload: {
        fdvLiquidityRatio: 120
      },
      checkedAt: "2026-05-15T11:00:00.000Z"
    });
    expect(riskSnapshot).toMatchObject({
      postId: post.postId,
      rugpullScore: 65,
      rugpullLevel: "high"
    });
    expect(repository.getDexDiscoveryForPost("signal-post")[0]).toMatchObject({
      rugpullScore: 65,
      previousRugpullScore: 0,
      rugpullLevel: "high",
      rugpullFlags: ["high_fdv_liquidity"],
      lastRugCheckedAt: "2026-05-15T11:00:00.000Z"
    });
    expect(repository.getSignalsPendingDexDiscovery({ minScore: 70, limit: 10, ttlMinutes: 1_000_000 })).toHaveLength(0);

    repository.close();
  });
});
