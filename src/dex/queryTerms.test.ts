import { describe, expect, it } from "vitest";

import type { MemeSignalAnalysisRecord } from "../types.js";
import { buildDexDiscoveryQueryTerms } from "./queryTerms.js";

function signal(overrides: Partial<MemeSignalAnalysisRecord> = {}): MemeSignalAnalysisRecord {
  return {
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
    narrative: "Ukraine peace deal speculation is rising",
    whySignal: "Event-driven phrase.",
    searchTerms: ["Ukraine Peace", "$PEACE"],
    possibleNames: [
      {
        name: "Ukraine Peace",
        ticker: "PEACE",
        priority: 95,
        reason: "Direct match."
      }
    ],
    entities: ["Ukraine"],
    urgency: "high",
    sensitivityFlags: [],
    recommendedAction: "urgent_search",
    ...overrides
  };
}

describe("buildDexDiscoveryQueryTerms", () => {
  it("dedupes and caps signal-derived search terms", () => {
    expect(buildDexDiscoveryQueryTerms(signal(), 5)).toEqual([
      "ukraine peace",
      "peace",
      "ukraine",
      "deal",
      "speculation"
    ]);
  });
});
