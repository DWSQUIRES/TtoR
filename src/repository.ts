import { computeHealthStatus } from "./health.js";
import type { AppConfig } from "./config.js";
import type {
  HealthSnapshot,
  DexDiscoveryRunInput,
  DexDiscoveryRunRecord,
  DexTokenCandidateInput,
  DexTokenCandidateRecord,
  MemeSignalAnalysisInput,
  MemeSignalAnalysisRecord,
  PollRunInput,
  PollRunRecord,
  MemeSignalStatus,
  StoredPost
} from "./types.js";

export type Awaitable<T> = T | Promise<T>;

export interface PostRepository {
  recordPollRun(input: PollRunInput): Awaitable<{ newPostsCount: number; latestPostId: string | null }>;
  getLatestPost(): Awaitable<StoredPost | null>;
  getPostsSinceDetectedAt(sinceDetectedAt: string): Awaitable<StoredPost[]>;
  getPostsSinceCreatedAt(sinceCreatedAt: string): Awaitable<StoredPost[]>;
  getUnanalyzedPosts(limit: number): Awaitable<StoredPost[]>;
  saveMemeSignalAnalysis(input: MemeSignalAnalysisInput): Awaitable<void>;
  getMemeAnalyses(options: { status: MemeSignalStatus | null; limit: number }): Awaitable<MemeSignalAnalysisRecord[]>;
  getMemeSignals(options: { minScore: number; limit: number }): Awaitable<MemeSignalAnalysisRecord[]>;
  getMemeSignalForPost(postId: string): Awaitable<MemeSignalAnalysisRecord | null>;
  getSignalsPendingDexDiscovery(options: {
    minScore: number;
    limit: number;
    ttlMinutes: number;
  }): Awaitable<MemeSignalAnalysisRecord[]>;
  saveDexDiscoveryRun(input: DexDiscoveryRunInput): Awaitable<DexDiscoveryRunRecord>;
  upsertDexTokenCandidates(postId: string, candidates: DexTokenCandidateInput[]): Awaitable<void>;
  getDexDiscoveries(options: { minScore: number; limit: number }): Awaitable<DexTokenCandidateRecord[]>;
  getDexDiscoveryForPost(postId: string): Awaitable<DexTokenCandidateRecord[]>;
  getLatestPoll(): Awaitable<PollRunRecord | null>;
  getLatestSuccessfulPoll(): Awaitable<PollRunRecord | null>;
  getHealthSnapshot(config: Pick<AppConfig, "targetHandle">, now?: Date): Awaitable<HealthSnapshot>;
  close(): Awaitable<void>;
}

export async function getRepositoryHealthSnapshot(
  repository: Pick<PostRepository, "getLatestPost" | "getLatestPoll" | "getLatestSuccessfulPoll">,
  config: Pick<AppConfig, "targetHandle">,
  now = new Date()
): Promise<HealthSnapshot> {
  const [latestPost, latestPoll, latestSuccessfulPoll] = await Promise.all([
    repository.getLatestPost(),
    repository.getLatestPoll(),
    repository.getLatestSuccessfulPoll()
  ]);

  return computeHealthStatus({
    targetHandle: config.targetHandle,
    latestPostId: latestPost?.postId ?? null,
    latestPoll,
    latestSuccessfulPoll,
    now
  });
}
