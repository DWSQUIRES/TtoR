import { describe, expect, it } from "vitest";

import { validateMemeSignalPayload } from "./memeSignalSchema.js";

describe("validateMemeSignalPayload", () => {
  it("accepts valid meme signal payloads", () => {
    expect(
      validateMemeSignalPayload({
        hasMemecoinSignal: true,
        signalScore: 84,
        confidence: "high",
        narrative: "Concrete skull found by Czech police",
        whySignal: "Bizarre visual phrase with direct ticker potential.",
        searchTerms: ["concrete skull", "saint skull"],
        possibleNames: [
          {
            name: "Concrete Skull",
            ticker: "SKULL",
            priority: 92,
            reason: "Direct visual name."
          }
        ],
        entities: ["Czech police"],
        urgency: "high",
        sensitivityFlags: ["death-related imagery"],
        recommendedAction: "urgent_search"
      })
    ).toMatchObject({
      hasMemecoinSignal: true,
      signalScore: 84,
      possibleNames: [
        {
          ticker: "SKULL"
        }
      ]
    });
  });

  it("rejects invalid scores", () => {
    expect(() =>
      validateMemeSignalPayload({
        hasMemecoinSignal: true,
        signalScore: 101,
        confidence: "high",
        narrative: "",
        whySignal: "",
        searchTerms: [],
        possibleNames: [],
        entities: [],
        urgency: "high",
        sensitivityFlags: [],
        recommendedAction: "search"
      })
    ).toThrow("invalid signalScore");
  });
});
