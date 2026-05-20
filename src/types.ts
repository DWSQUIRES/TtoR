export type PollRunStatus = "success" | "error";

export type ErrorCode =
  | "LOGIN_REQUIRED"
  | "TIMELINE_NOT_FOUND"
  | "PARSE_FAILED"
  | "NAVIGATION_FAILED"
  | "UNKNOWN";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface MediaAsset {
  kind: "image" | "video";
  url: string;
  alt: string | null;
}

export interface NormalizedPost {
  postId: string;
  authorHandle: string;
  authorDisplayName: string | null;
  createdAt: string | null;
  detectedAt: string;
  text: string;
  lang: string | null;
  conversationId: string | null;
  replyToPostId: string | null;
  quotedPostId: string | null;
  isRepost: boolean;
  media: MediaAsset[];
  rawPayload: Record<string, unknown>;
}

export interface PollRunRecord {
  id: number;
  startedAt: string;
  finishedAt: string;
  status: PollRunStatus;
  newPostsCount: number;
  errorCode: ErrorCode | null;
  errorMessage: string | null;
  latestPostId: string | null;
  metadata: Record<string, unknown>;
}

export interface PollRunInput {
  startedAt: string;
  finishedAt: string;
  status: PollRunStatus;
  posts?: NormalizedPost[];
  errorCode?: ErrorCode | null;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface StoredPost extends NormalizedPost {
  insertedAt: string;
}

export type MemeSignalConfidence = "low" | "medium" | "high";
export type MemeSignalUrgency = "low" | "medium" | "high";
export type MemeSignalRecommendedAction = "ignore" | "watch" | "search" | "urgent_search";
export type MemeSignalStatus = "success" | "error";

export interface MemeSignalName {
  name: string;
  ticker: string;
  priority: number;
  reason: string;
}

export interface MemeSignalAnalysisPayload {
  hasMemecoinSignal: boolean;
  signalScore: number;
  confidence: MemeSignalConfidence;
  narrative: string;
  whySignal: string;
  searchTerms: string[];
  possibleNames: MemeSignalName[];
  entities: string[];
  urgency: MemeSignalUrgency;
  sensitivityFlags: string[];
  recommendedAction: MemeSignalRecommendedAction;
}

export interface MemeSignalAnalysisRecord extends MemeSignalAnalysisPayload {
  postId: string;
  status: MemeSignalStatus;
  model: string;
  promptVersion: string;
  rawPayload: Record<string, unknown>;
  errorMessage: string | null;
  createdAt: string;
}

export interface MemeSignalAnalysisInput {
  postId: string;
  status: MemeSignalStatus;
  model: string;
  promptVersion: string;
  analysis?: MemeSignalAnalysisPayload;
  rawPayload?: Record<string, unknown>;
  errorMessage?: string | null;
  createdAt: string;
}

export type DexDiscoveryStatus = "success" | "error";

export type DexTokenCandidateRiskFlag =
  | "low_liquidity"
  | "low_volume"
  | "new_pair"
  | "missing_socials"
  | "duplicate_symbol"
  | "high_fdv_low_liquidity";

export interface DexDiscoveryRunInput {
  postId: string;
  status: DexDiscoveryStatus;
  startedAt: string;
  finishedAt: string;
  signalCount: number;
  candidateCount: number;
  errorCount: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}

export interface DexDiscoveryRunRecord extends DexDiscoveryRunInput {
  id: number;
}

export interface DexTokenCandidateInput {
  postId: string;
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseTokenAddress: string;
  baseTokenName: string;
  baseTokenSymbol: string;
  quoteTokenSymbol: string | null;
  url: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  volume24hUsd: number | null;
  marketCap: number | null;
  fdv: number | null;
  pairCreatedAt: string | null;
  matchScore: number;
  riskFlags: DexTokenCandidateRiskFlag[];
  matchedTerms: string[];
  rawPayload: Record<string, unknown>;
  discoveredAt: string;
}

export interface DexTokenCandidateRecord extends DexTokenCandidateInput {
  createdAt: string;
  updatedAt: string;
  signalScore: number | null;
  narrative: string | null;
  whySignal: string | null;
}

export interface HealthSnapshot {
  status: HealthStatus;
  targetHandle: string;
  lastSuccessfulPollAt: string | null;
  lastPollAt: string | null;
  latestPostId: string | null;
  lastErrorCode: ErrorCode | null;
  loginState: "valid" | "expired" | "unknown";
}

export interface ScrapeResult {
  posts: NormalizedPost[];
  loginExpired: boolean;
  extractedAt: string;
  sourceUrl: string;
  rawHtml: string;
  artifactPaths: string[];
}

export interface TimelineScraper {
  scrapeTimeline(handle: string): Promise<ScrapeResult>;
  close(): Promise<void>;
}

export interface PollCycleSummary {
  startedAt: string;
  finishedAt: string;
  status: PollRunStatus;
  newPostsCount: number;
  latestPostId: string | null;
  errorCode: ErrorCode | null;
  aiAnalyzedCount?: number;
  aiSignalCount?: number;
  aiErrorCount?: number;
}

export interface BackfillResult {
  posts: NormalizedPost[];
  startedAt: string;
  finishedAt: string;
  sourceUrl: string;
  since: string;
  pagesCaptured: number;
  scrolls: number;
  oldestPostAt: string | null;
  newestPostAt: string | null;
  stoppedReason: "reached_since" | "no_progress" | "max_scrolls" | "request_failed";
}
