import { describe, expect, it } from "vitest";

import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import { Repository } from "../storage.js";
import type { StoredPost } from "../types.js";
import type { MemeSignalAnalyzer } from "./memeSignalAnalyzer.js";
import { MemeSignalService } from "./memeSignalService.js";

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
};

const config: Pick<AppConfig, "aiMaxPostsPerPoll" | "memeSignalThreshold" | "openaiModel"> = {
  aiMaxPostsPerPoll: 10,
  memeSignalThreshold: 70,
  openaiModel: "test-model"
};

function createPost(postId: string): StoredPost {
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
    rawPayload: {},
    insertedAt: "2026-05-15T10:00:05.000Z"
  };
}

describe("MemeSignalService", () => {
  it("continues analyzing other posts when one analyzer call fails", async () => {
    const repository = Repository.open(":memory:");
    repository.recordPollRun({
      startedAt: "2026-05-15T10:00:00.000Z",
      finishedAt: "2026-05-15T10:00:05.000Z",
      status: "success",
      posts: [createPost("good"), createPost("bad")]
    });

    const analyzer: MemeSignalAnalyzer = {
      analyze: async (post) => {
        if (post.postId === "bad") {
          throw new Error("model unavailable");
        }

        return {
          model: "test-model",
          promptVersion: "test-prompt",
          rawPayload: {},
          analysis: {
            hasMemecoinSignal: true,
            signalScore: 90,
            confidence: "high",
            narrative: "Concrete skull recovered",
            whySignal: "Short bizarre visual phrase.",
            searchTerms: ["concrete skull"],
            possibleNames: [
              {
                name: "Concrete Skull",
                ticker: "SKULL",
                priority: 95,
                reason: "Direct phrase."
              }
            ],
            entities: [],
            urgency: "high",
            sensitivityFlags: ["death-related imagery"],
            recommendedAction: "urgent_search"
          }
        };
      }
    };

    const service = new MemeSignalService(
      config,
      repository,
      analyzer,
      silentLogger,
      () => new Date("2026-05-15T10:00:06.000Z")
    );

    await expect(service.analyzePendingPosts()).resolves.toEqual({
      analyzedCount: 1,
      signalCount: 1,
      errorCount: 1
    });
    expect(repository.getUnanalyzedPosts(10)).toHaveLength(0);
    expect(repository.getMemeSignalForPost("bad")).toMatchObject({
      status: "error",
      errorMessage: "model unavailable"
    });

    repository.close();
  });
});
