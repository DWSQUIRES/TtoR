import OpenAI from "openai";

import type { Logger } from "../logger.js";
import type { MemeSignalAnalysisPayload, StoredPost } from "../types.js";
import { buildMemeSignalInput, buildMemeSignalInstructions } from "./memeSignalPrompt.js";
import {
  MEME_SIGNAL_PROMPT_VERSION,
  memeSignalJsonSchema,
  validateMemeSignalPayload
} from "./memeSignalSchema.js";

export interface MemeSignalAnalyzerResult {
  analysis: MemeSignalAnalysisPayload;
  rawPayload: Record<string, unknown>;
  model: string;
  promptVersion: string;
}

export interface MemeSignalAnalyzer {
  analyze(post: StoredPost): Promise<MemeSignalAnalyzerResult>;
}

export interface OpenAIMemeSignalAnalyzerOptions {
  apiKey: string;
  baseUrl: string | null;
  model: string;
  reasoningEffort: "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | null;
  storeResponses: boolean;
  timeoutMs: number;
}

export class OpenAIMemeSignalAnalyzer implements MemeSignalAnalyzer {
  private readonly client: OpenAI;

  public constructor(
    private readonly options: OpenAIMemeSignalAnalyzerOptions,
    private readonly logger: Logger
  ) {
    this.client = new OpenAI({
      apiKey: options.apiKey,
      baseURL: options.baseUrl ?? undefined
    });
  }

  public async analyze(post: StoredPost): Promise<MemeSignalAnalyzerResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, this.options.timeoutMs);

    try {
      const response = await this.client.responses.create(
        {
          model: this.options.model,
          instructions: buildMemeSignalInstructions(),
          input: buildMemeSignalInput(post),
          reasoning: this.options.reasoningEffort ? { effort: this.options.reasoningEffort } : undefined,
          store: this.options.storeResponses,
          text: {
            format: {
              type: "json_schema",
              name: "meme_signal_analysis",
              description: "Memecoin search signal analysis for a Polymarket X post.",
              schema: memeSignalJsonSchema,
              strict: true
            }
          }
        },
        {
          maxRetries: 0,
          signal: controller.signal,
          timeout: this.options.timeoutMs
        }
      );

      if (response.error) {
        throw new Error(response.error.message);
      }

      if (!response.output_text) {
        throw new Error("OpenAI returned an empty meme signal response");
      }

      const parsed = validateMemeSignalPayload(JSON.parse(response.output_text));
      this.logger.debug("OpenAI meme signal analysis completed", {
        postId: post.postId,
        signalScore: parsed.signalScore,
        hasMemecoinSignal: parsed.hasMemecoinSignal
      });

      return {
        analysis: parsed,
        rawPayload: {
          responseId: response.id,
          outputText: response.output_text,
          usage: response.usage ?? null
        },
        model: this.options.model,
        promptVersion: MEME_SIGNAL_PROMPT_VERSION
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
