import type { AppConfig } from "../config.js";
import type { Logger } from "../logger.js";
import type { PostRepository } from "../repository.js";
import type { MemeSignalAnalysisInput } from "../types.js";
import type { MemeSignalAnalyzer } from "./memeSignalAnalyzer.js";
import { MEME_SIGNAL_PROMPT_VERSION } from "./memeSignalSchema.js";

export interface MemeSignalRunSummary {
  analyzedCount: number;
  signalCount: number;
  errorCount: number;
}

export class MemeSignalService {
  public constructor(
    private readonly config: Pick<AppConfig, "aiMaxPostsPerPoll" | "memeSignalThreshold" | "openaiModel">,
    private readonly repository: PostRepository,
    private readonly analyzer: MemeSignalAnalyzer,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async analyzePendingPosts(): Promise<MemeSignalRunSummary> {
    const posts = await this.repository.getUnanalyzedPosts(this.config.aiMaxPostsPerPoll);
    let analyzedCount = 0;
    let signalCount = 0;
    let errorCount = 0;

    for (const post of posts) {
      try {
        const result = await this.analyzer.analyze(post);
        const input: MemeSignalAnalysisInput = {
          postId: post.postId,
          status: "success",
          model: result.model,
          promptVersion: result.promptVersion,
          analysis: result.analysis,
          rawPayload: result.rawPayload,
          errorMessage: null,
          createdAt: this.now().toISOString()
        };

        await this.repository.saveMemeSignalAnalysis(input);
        analyzedCount += 1;
        if (result.analysis.hasMemecoinSignal && result.analysis.signalScore >= this.config.memeSignalThreshold) {
          signalCount += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown AI analysis error";
        await this.repository.saveMemeSignalAnalysis({
          postId: post.postId,
          status: "error",
          model: this.config.openaiModel,
          promptVersion: MEME_SIGNAL_PROMPT_VERSION,
          rawPayload: {},
          errorMessage: message,
          createdAt: this.now().toISOString()
        });
        errorCount += 1;
        this.logger.warn("Meme signal analysis failed for post", {
          postId: post.postId,
          message
        });
      }
    }

    return {
      analyzedCount,
      signalCount,
      errorCount
    };
  }
}
