import type {
  MemeSignalAnalysisPayload,
  MemeSignalConfidence,
  MemeSignalRecommendedAction,
  MemeSignalUrgency
} from "../types.js";

export const MEME_SIGNAL_PROMPT_VERSION = "meme-signal-v1";

export const memeSignalJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "hasMemecoinSignal",
    "signalScore",
    "confidence",
    "narrative",
    "whySignal",
    "searchTerms",
    "possibleNames",
    "entities",
    "urgency",
    "sensitivityFlags",
    "recommendedAction"
  ],
  properties: {
    hasMemecoinSignal: {
      type: "boolean"
    },
    signalScore: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    confidence: {
      type: "string",
      enum: ["low", "medium", "high"]
    },
    narrative: {
      type: "string"
    },
    whySignal: {
      type: "string"
    },
    searchTerms: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "string"
      }
    },
    possibleNames: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "ticker", "priority", "reason"],
        properties: {
          name: {
            type: "string"
          },
          ticker: {
            type: "string"
          },
          priority: {
            type: "integer",
            minimum: 0,
            maximum: 100
          },
          reason: {
            type: "string"
          }
        }
      }
    },
    entities: {
      type: "array",
      minItems: 0,
      maxItems: 12,
      items: {
        type: "string"
      }
    },
    urgency: {
      type: "string",
      enum: ["low", "medium", "high"]
    },
    sensitivityFlags: {
      type: "array",
      minItems: 0,
      maxItems: 8,
      items: {
        type: "string"
      }
    },
    recommendedAction: {
      type: "string",
      enum: ["ignore", "watch", "search", "urgent_search"]
    }
  }
} as const;

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isConfidence(value: unknown): value is MemeSignalConfidence {
  return value === "low" || value === "medium" || value === "high";
}

function isUrgency(value: unknown): value is MemeSignalUrgency {
  return value === "low" || value === "medium" || value === "high";
}

function isRecommendedAction(value: unknown): value is MemeSignalRecommendedAction {
  return value === "ignore" || value === "watch" || value === "search" || value === "urgent_search";
}

function isScore(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100;
}

export function validateMemeSignalPayload(value: unknown): MemeSignalAnalysisPayload {
  if (!value || typeof value !== "object") {
    throw new Error("Meme signal payload must be an object");
  }

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.hasMemecoinSignal !== "boolean") {
    throw new Error("Meme signal payload has invalid hasMemecoinSignal");
  }
  if (!isScore(candidate.signalScore)) {
    throw new Error("Meme signal payload has invalid signalScore");
  }
  if (!isConfidence(candidate.confidence)) {
    throw new Error("Meme signal payload has invalid confidence");
  }
  if (typeof candidate.narrative !== "string") {
    throw new Error("Meme signal payload has invalid narrative");
  }
  if (typeof candidate.whySignal !== "string") {
    throw new Error("Meme signal payload has invalid whySignal");
  }
  if (!isStringArray(candidate.searchTerms)) {
    throw new Error("Meme signal payload has invalid searchTerms");
  }
  if (!Array.isArray(candidate.possibleNames)) {
    throw new Error("Meme signal payload has invalid possibleNames");
  }
  if (!isStringArray(candidate.entities)) {
    throw new Error("Meme signal payload has invalid entities");
  }
  if (!isUrgency(candidate.urgency)) {
    throw new Error("Meme signal payload has invalid urgency");
  }
  if (!isStringArray(candidate.sensitivityFlags)) {
    throw new Error("Meme signal payload has invalid sensitivityFlags");
  }
  if (!isRecommendedAction(candidate.recommendedAction)) {
    throw new Error("Meme signal payload has invalid recommendedAction");
  }

  const possibleNames = candidate.possibleNames.map((item) => {
    if (!item || typeof item !== "object") {
      throw new Error("Meme signal payload has invalid possibleNames item");
    }

    const nameCandidate = item as Record<string, unknown>;
    if (
      typeof nameCandidate.name !== "string" ||
      typeof nameCandidate.ticker !== "string" ||
      !isScore(nameCandidate.priority) ||
      typeof nameCandidate.reason !== "string"
    ) {
      throw new Error("Meme signal payload has invalid possibleNames item");
    }

    return {
      name: nameCandidate.name,
      ticker: nameCandidate.ticker,
      priority: nameCandidate.priority,
      reason: nameCandidate.reason
    };
  });

  return {
    hasMemecoinSignal: candidate.hasMemecoinSignal,
    signalScore: candidate.signalScore,
    confidence: candidate.confidence,
    narrative: candidate.narrative,
    whySignal: candidate.whySignal,
    searchTerms: candidate.searchTerms,
    possibleNames,
    entities: candidate.entities,
    urgency: candidate.urgency,
    sensitivityFlags: candidate.sensitivityFlags,
    recommendedAction: candidate.recommendedAction
  };
}
