import { createRequire } from "node:module";

import type {
  AppConfig
} from "./config.js";
import { getRepositoryHealthSnapshot, type PostRepository } from "./repository.js";
import type {
  DexDiscoveryRunInput,
  DexDiscoveryRunRecord,
  DexDiscoveryStatus,
  DexTokenCandidateInput,
  DexTokenCandidateRecord,
  DexTokenCandidateRiskFlag,
  HealthSnapshot,
  MemeSignalAnalysisInput,
  MemeSignalAnalysisRecord,
  MemeSignalAnalysisPayload,
  MemeSignalStatus,
  NormalizedPost,
  PollRunInput,
  PollRunRecord,
  StoredPost
} from "./types.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type DatabaseSyncInstance = InstanceType<typeof DatabaseSync>;

function parseJson<T>(value: string | null): T {
  if (!value) {
    return [] as T;
  }
  return JSON.parse(value) as T;
}

function rowToStoredPost(row: Record<string, unknown>): StoredPost {
  return {
    postId: String(row.post_id),
    authorHandle: String(row.author_handle),
    authorDisplayName: row.author_display_name ? String(row.author_display_name) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
    detectedAt: String(row.detected_at),
    text: String(row.text),
    lang: row.lang ? String(row.lang) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    replyToPostId: row.reply_to_post_id ? String(row.reply_to_post_id) : null,
    quotedPostId: row.quoted_post_id ? String(row.quoted_post_id) : null,
    isRepost: Number(row.is_repost) === 1,
    media: parseJson(row.media_json as string | null),
    rawPayload: parseJson(row.raw_payload_json as string | null),
    insertedAt: String(row.inserted_at)
  };
}

function rowToPollRun(row: Record<string, unknown>): PollRunRecord {
  return {
    id: Number(row.id),
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    status: String(row.status) as PollRunRecord["status"],
    newPostsCount: Number(row.new_posts_count),
    errorCode: row.error_code ? String(row.error_code) as PollRunRecord["errorCode"] : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    latestPostId: row.latest_post_id ? String(row.latest_post_id) : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null)
  };
}

const emptyMemeSignalPayload: MemeSignalAnalysisPayload = {
  hasMemecoinSignal: false,
  signalScore: 0,
  confidence: "low",
  narrative: "",
  whySignal: "",
  searchTerms: [],
  possibleNames: [],
  entities: [],
  urgency: "low",
  sensitivityFlags: [],
  recommendedAction: "ignore"
};

function rowToMemeSignalAnalysis(row: Record<string, unknown>): MemeSignalAnalysisRecord {
  const payload = parseJson<MemeSignalAnalysisPayload>(
    row.analysis_json as string | null
  ) || emptyMemeSignalPayload;

  return {
    postId: String(row.post_id),
    status: String(row.status) as MemeSignalAnalysisRecord["status"],
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    rawPayload: parseJson<Record<string, unknown>>(row.raw_payload_json as string | null),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: String(row.created_at),
    ...payload
  };
}

function rowToDexDiscoveryRun(row: Record<string, unknown>): DexDiscoveryRunRecord {
  return {
    id: Number(row.id),
    postId: String(row.post_id),
    status: String(row.status) as DexDiscoveryStatus,
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    signalCount: Number(row.signal_count),
    candidateCount: Number(row.candidate_count),
    errorCount: Number(row.error_count),
    errorMessage: row.error_message ? String(row.error_message) : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json as string | null)
  };
}

function rowToDexTokenCandidate(row: Record<string, unknown>): DexTokenCandidateRecord {
  return {
    postId: String(row.post_id),
    chainId: String(row.chain_id),
    dexId: String(row.dex_id),
    pairAddress: String(row.pair_address),
    baseTokenAddress: String(row.base_token_address),
    baseTokenName: String(row.base_token_name),
    baseTokenSymbol: String(row.base_token_symbol),
    quoteTokenSymbol: row.quote_token_symbol ? String(row.quote_token_symbol) : null,
    url: String(row.url),
    priceUsd: row.price_usd === null || row.price_usd === undefined ? null : Number(row.price_usd),
    liquidityUsd: row.liquidity_usd === null || row.liquidity_usd === undefined ? null : Number(row.liquidity_usd),
    volume24hUsd: row.volume_24h_usd === null || row.volume_24h_usd === undefined ? null : Number(row.volume_24h_usd),
    marketCap: row.market_cap === null || row.market_cap === undefined ? null : Number(row.market_cap),
    fdv: row.fdv === null || row.fdv === undefined ? null : Number(row.fdv),
    pairCreatedAt: row.pair_created_at ? String(row.pair_created_at) : null,
    matchScore: Number(row.match_score),
    riskFlags: parseJson<DexTokenCandidateRiskFlag[]>(row.risk_flags_json as string | null),
    matchedTerms: parseJson<string[]>(row.matched_terms_json as string | null),
    rawPayload: parseJson<Record<string, unknown>>(row.raw_payload_json as string | null),
    discoveredAt: String(row.discovered_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    signalScore: row.signal_score === null || row.signal_score === undefined ? null : Number(row.signal_score),
    narrative: row.narrative ? String(row.narrative) : null,
    whySignal: row.why_signal ? String(row.why_signal) : null
  };
}

export class Repository implements PostRepository {
  private readonly insertPostStatement;
  private readonly insertPollRunStatement;
  private readonly latestPostStatement;
  private readonly postsSinceStatement;
  private readonly postsSinceCreatedAtStatement;
  private readonly unanalyzedPostsStatement;
  private readonly upsertMemeSignalAnalysisStatement;
  private readonly memeAnalysesStatement;
  private readonly memeAnalysesByStatusStatement;
  private readonly memeSignalsStatement;
  private readonly memeSignalForPostStatement;
  private readonly signalsPendingDexDiscoveryStatement;
  private readonly insertDexDiscoveryRunStatement;
  private readonly deleteDexTokenCandidatesForPostStatement;
  private readonly upsertDexTokenCandidateStatement;
  private readonly dexDiscoveriesStatement;
  private readonly dexDiscoveryForPostStatement;
  private readonly latestPollStatement;
  private readonly latestSuccessfulPollStatement;

  public constructor(private readonly db: DatabaseSyncInstance) {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS posts (
        post_id TEXT PRIMARY KEY,
        author_handle TEXT NOT NULL,
        author_display_name TEXT,
        created_at TEXT,
        detected_at TEXT NOT NULL,
        text TEXT NOT NULL,
        lang TEXT,
        conversation_id TEXT,
        reply_to_post_id TEXT,
        quoted_post_id TEXT,
        is_repost INTEGER NOT NULL DEFAULT 0,
        media_json TEXT NOT NULL,
        raw_payload_json TEXT NOT NULL,
        inserted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_posts_detected_at ON posts(detected_at DESC);
      CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

      CREATE TABLE IF NOT EXISTS poll_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        status TEXT NOT NULL,
        new_posts_count INTEGER NOT NULL,
        error_code TEXT,
        error_message TEXT,
        latest_post_id TEXT,
        metadata_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_poll_runs_finished_at ON poll_runs(finished_at DESC);

      CREATE TABLE IF NOT EXISTS meme_signal_analyses (
        post_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        analysis_json TEXT NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        raw_payload_json TEXT NOT NULL,
        error_message TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_meme_signal_analyses_score
        ON meme_signal_analyses(json_extract(analysis_json, '$.signalScore') DESC);

      CREATE TABLE IF NOT EXISTS dex_discovery_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT NOT NULL,
        signal_count INTEGER NOT NULL,
        candidate_count INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        error_message TEXT,
        metadata_json TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_dex_discovery_runs_post_finished
        ON dex_discovery_runs(post_id, finished_at DESC);

      CREATE TABLE IF NOT EXISTS dex_token_candidates (
        post_id TEXT NOT NULL,
        chain_id TEXT NOT NULL,
        dex_id TEXT NOT NULL,
        pair_address TEXT NOT NULL,
        base_token_address TEXT NOT NULL,
        base_token_name TEXT NOT NULL,
        base_token_symbol TEXT NOT NULL,
        quote_token_symbol TEXT,
        url TEXT NOT NULL,
        price_usd REAL,
        liquidity_usd REAL,
        volume_24h_usd REAL,
        market_cap REAL,
        fdv REAL,
        pair_created_at TEXT,
        match_score INTEGER NOT NULL,
        risk_flags_json TEXT NOT NULL,
        matched_terms_json TEXT NOT NULL,
        raw_payload_json TEXT NOT NULL,
        discovered_at TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (post_id, chain_id, pair_address)
      );

      CREATE INDEX IF NOT EXISTS idx_dex_token_candidates_score
        ON dex_token_candidates(match_score DESC, discovered_at DESC);
    `);

    this.insertPostStatement = this.db.prepare(`
      INSERT OR IGNORE INTO posts (
        post_id,
        author_handle,
        author_display_name,
        created_at,
        detected_at,
        text,
        lang,
        conversation_id,
        reply_to_post_id,
        quoted_post_id,
        is_repost,
        media_json,
        raw_payload_json
      ) VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?,
        ?
      )
    `);

    this.insertPollRunStatement = this.db.prepare(`
      INSERT INTO poll_runs (
        started_at,
        finished_at,
        status,
        new_posts_count,
        error_code,
        error_message,
        latest_post_id,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.latestPostStatement = this.db.prepare(`
      SELECT *
      FROM posts
      ORDER BY COALESCE(created_at, detected_at) DESC, post_id DESC
      LIMIT 1
    `);

    this.postsSinceStatement = this.db.prepare(`
      SELECT *
      FROM posts
      WHERE detected_at > ?
      ORDER BY detected_at ASC, post_id ASC
    `);

    this.postsSinceCreatedAtStatement = this.db.prepare(`
      SELECT *
      FROM posts
      WHERE datetime(COALESCE(created_at, detected_at)) >= datetime(?)
      ORDER BY datetime(COALESCE(created_at, detected_at)) ASC, post_id ASC
    `);

    this.unanalyzedPostsStatement = this.db.prepare(`
      SELECT posts.*
      FROM posts
      LEFT JOIN meme_signal_analyses ON meme_signal_analyses.post_id = posts.post_id
      WHERE meme_signal_analyses.post_id IS NULL
      ORDER BY COALESCE(posts.created_at, posts.detected_at) DESC, posts.post_id DESC
      LIMIT ?
    `);

    this.upsertMemeSignalAnalysisStatement = this.db.prepare(`
      INSERT INTO meme_signal_analyses (
        post_id,
        status,
        analysis_json,
        model,
        prompt_version,
        raw_payload_json,
        error_message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(post_id) DO UPDATE SET
        status = excluded.status,
        analysis_json = excluded.analysis_json,
        model = excluded.model,
        prompt_version = excluded.prompt_version,
        raw_payload_json = excluded.raw_payload_json,
        error_message = excluded.error_message,
        created_at = excluded.created_at
    `);

    this.memeSignalsStatement = this.db.prepare(`
      SELECT *
      FROM meme_signal_analyses
      WHERE status = 'success'
        AND json_extract(analysis_json, '$.hasMemecoinSignal') = 1
        AND json_extract(analysis_json, '$.signalScore') >= ?
      ORDER BY json_extract(analysis_json, '$.signalScore') DESC, created_at DESC
      LIMIT ?
    `);

    this.memeAnalysesStatement = this.db.prepare(`
      SELECT *
      FROM meme_signal_analyses
      ORDER BY created_at DESC
      LIMIT ?
    `);

    this.memeAnalysesByStatusStatement = this.db.prepare(`
      SELECT *
      FROM meme_signal_analyses
      WHERE status = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);

    this.memeSignalForPostStatement = this.db.prepare(`
      SELECT *
      FROM meme_signal_analyses
      WHERE post_id = ?
      LIMIT 1
    `);

    this.signalsPendingDexDiscoveryStatement = this.db.prepare(`
      SELECT meme_signal_analyses.*
      FROM meme_signal_analyses
      LEFT JOIN (
        SELECT post_id, MAX(finished_at) AS latest_finished_at
        FROM dex_discovery_runs
        GROUP BY post_id
      ) latest_runs ON latest_runs.post_id = meme_signal_analyses.post_id
      WHERE meme_signal_analyses.status = 'success'
        AND json_extract(analysis_json, '$.hasMemecoinSignal') = 1
        AND json_extract(analysis_json, '$.signalScore') >= ?
        AND (
          latest_runs.latest_finished_at IS NULL
          OR datetime(latest_runs.latest_finished_at) <= datetime(?)
        )
      ORDER BY json_extract(analysis_json, '$.signalScore') DESC, meme_signal_analyses.created_at DESC
      LIMIT ?
    `);

    this.insertDexDiscoveryRunStatement = this.db.prepare(`
      INSERT INTO dex_discovery_runs (
        post_id,
        status,
        started_at,
        finished_at,
        signal_count,
        candidate_count,
        error_count,
        error_message,
        metadata_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING *
    `);

    this.deleteDexTokenCandidatesForPostStatement = this.db.prepare(`
      DELETE FROM dex_token_candidates
      WHERE post_id = ?
    `);

    this.upsertDexTokenCandidateStatement = this.db.prepare(`
      INSERT INTO dex_token_candidates (
        post_id,
        chain_id,
        dex_id,
        pair_address,
        base_token_address,
        base_token_name,
        base_token_symbol,
        quote_token_symbol,
        url,
        price_usd,
        liquidity_usd,
        volume_24h_usd,
        market_cap,
        fdv,
        pair_created_at,
        match_score,
        risk_flags_json,
        matched_terms_json,
        raw_payload_json,
        discovered_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(post_id, chain_id, pair_address) DO UPDATE SET
        dex_id = excluded.dex_id,
        base_token_address = excluded.base_token_address,
        base_token_name = excluded.base_token_name,
        base_token_symbol = excluded.base_token_symbol,
        quote_token_symbol = excluded.quote_token_symbol,
        url = excluded.url,
        price_usd = excluded.price_usd,
        liquidity_usd = excluded.liquidity_usd,
        volume_24h_usd = excluded.volume_24h_usd,
        market_cap = excluded.market_cap,
        fdv = excluded.fdv,
        pair_created_at = excluded.pair_created_at,
        match_score = excluded.match_score,
        risk_flags_json = excluded.risk_flags_json,
        matched_terms_json = excluded.matched_terms_json,
        raw_payload_json = excluded.raw_payload_json,
        discovered_at = excluded.discovered_at,
        updated_at = excluded.updated_at
    `);

    this.dexDiscoveriesStatement = this.db.prepare(`
      SELECT
        dex_token_candidates.*,
        json_extract(meme_signal_analyses.analysis_json, '$.signalScore') AS signal_score,
        json_extract(meme_signal_analyses.analysis_json, '$.narrative') AS narrative,
        json_extract(meme_signal_analyses.analysis_json, '$.whySignal') AS why_signal
      FROM dex_token_candidates
      JOIN meme_signal_analyses ON meme_signal_analyses.post_id = dex_token_candidates.post_id
      WHERE match_score >= ?
      ORDER BY match_score DESC, COALESCE(liquidity_usd, 0) DESC, discovered_at DESC
      LIMIT ?
    `);

    this.dexDiscoveryForPostStatement = this.db.prepare(`
      SELECT
        dex_token_candidates.*,
        json_extract(meme_signal_analyses.analysis_json, '$.signalScore') AS signal_score,
        json_extract(meme_signal_analyses.analysis_json, '$.narrative') AS narrative,
        json_extract(meme_signal_analyses.analysis_json, '$.whySignal') AS why_signal
      FROM dex_token_candidates
      LEFT JOIN meme_signal_analyses ON meme_signal_analyses.post_id = dex_token_candidates.post_id
      WHERE dex_token_candidates.post_id = ?
      ORDER BY match_score DESC, COALESCE(liquidity_usd, 0) DESC, discovered_at DESC
    `);

    this.latestPollStatement = this.db.prepare(`
      SELECT *
      FROM poll_runs
      ORDER BY finished_at DESC, id DESC
      LIMIT 1
    `);

    this.latestSuccessfulPollStatement = this.db.prepare(`
      SELECT *
      FROM poll_runs
      WHERE status = 'success'
      ORDER BY finished_at DESC, id DESC
      LIMIT 1
    `);
  }

  public static open(databasePath: string): Repository {
    const db = new DatabaseSync(databasePath);
    return new Repository(db);
  }

  public close(): void {
    this.db.close();
  }

  public recordPollRun(input: PollRunInput): { newPostsCount: number; latestPostId: string | null } {
    const posts = input.posts ?? [];
    let newPostsCount = 0;

    this.db.exec("BEGIN");

    try {
      for (const post of posts) {
        const result = this.insertPostStatement.run(
          post.postId,
          post.authorHandle,
          post.authorDisplayName,
          post.createdAt,
          post.detectedAt,
          post.text,
          post.lang,
          post.conversationId,
          post.replyToPostId,
          post.quotedPostId,
          post.isRepost ? 1 : 0,
          JSON.stringify(post.media),
          JSON.stringify(post.rawPayload)
        );

        newPostsCount += Number(result.changes ?? 0);
      }

      const latestPostId = posts[0]?.postId ?? this.getLatestPost()?.postId ?? null;
      this.insertPollRunStatement.run(
        input.startedAt,
        input.finishedAt,
        input.status,
        newPostsCount,
        input.errorCode ?? null,
        input.errorMessage ?? null,
        latestPostId,
        JSON.stringify(input.metadata ?? {})
      );

      this.db.exec("COMMIT");
      return { newPostsCount, latestPostId };
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public getLatestPost(): StoredPost | null {
    const row = this.latestPostStatement.get() as Record<string, unknown> | undefined;
    return row ? rowToStoredPost(row) : null;
  }

  public getPostsSinceDetectedAt(sinceDetectedAt: string): StoredPost[] {
    const rows = this.postsSinceStatement.all(sinceDetectedAt) as Record<string, unknown>[];
    return rows.map(rowToStoredPost);
  }

  public getPostsSinceCreatedAt(sinceCreatedAt: string): StoredPost[] {
    const rows = this.postsSinceCreatedAtStatement.all(sinceCreatedAt) as Record<string, unknown>[];
    return rows.map(rowToStoredPost);
  }

  public getUnanalyzedPosts(limit: number): StoredPost[] {
    const rows = this.unanalyzedPostsStatement.all(limit) as Record<string, unknown>[];
    return rows.map(rowToStoredPost);
  }

  public saveMemeSignalAnalysis(input: MemeSignalAnalysisInput): void {
    this.upsertMemeSignalAnalysisStatement.run(
      input.postId,
      input.status,
      JSON.stringify(input.analysis ?? emptyMemeSignalPayload),
      input.model,
      input.promptVersion,
      JSON.stringify(input.rawPayload ?? {}),
      input.errorMessage ?? null,
      input.createdAt
    );
  }

  public getMemeSignals(options: { minScore: number; limit: number }): MemeSignalAnalysisRecord[] {
    const rows = this.memeSignalsStatement.all(options.minScore, options.limit) as Record<string, unknown>[];
    return rows.map(rowToMemeSignalAnalysis);
  }

  public getMemeAnalyses(options: { status: MemeSignalStatus | null; limit: number }): MemeSignalAnalysisRecord[] {
    const rows = options.status
      ? this.memeAnalysesByStatusStatement.all(options.status, options.limit)
      : this.memeAnalysesStatement.all(options.limit);
    return (rows as Record<string, unknown>[]).map(rowToMemeSignalAnalysis);
  }

  public getMemeSignalForPost(postId: string): MemeSignalAnalysisRecord | null {
    const row = this.memeSignalForPostStatement.get(postId) as Record<string, unknown> | undefined;
    return row ? rowToMemeSignalAnalysis(row) : null;
  }

  public getSignalsPendingDexDiscovery(options: {
    minScore: number;
    limit: number;
    ttlMinutes: number;
  }): MemeSignalAnalysisRecord[] {
    const staleBefore = new Date(Date.now() - options.ttlMinutes * 60_000).toISOString();
    const rows = this.signalsPendingDexDiscoveryStatement.all(
      options.minScore,
      staleBefore,
      options.limit
    ) as Record<string, unknown>[];
    return rows.map(rowToMemeSignalAnalysis);
  }

  public saveDexDiscoveryRun(input: DexDiscoveryRunInput): DexDiscoveryRunRecord {
    const row = this.insertDexDiscoveryRunStatement.get(
      input.postId,
      input.status,
      input.startedAt,
      input.finishedAt,
      input.signalCount,
      input.candidateCount,
      input.errorCount,
      input.errorMessage ?? null,
      JSON.stringify(input.metadata ?? {})
    ) as Record<string, unknown>;
    return rowToDexDiscoveryRun(row);
  }

  public upsertDexTokenCandidates(postId: string, candidates: DexTokenCandidateInput[]): void {
    this.db.exec("BEGIN");

    try {
      this.deleteDexTokenCandidatesForPostStatement.run(postId);
      for (const candidate of candidates) {
        this.upsertDexTokenCandidateStatement.run(
          postId,
          candidate.chainId,
          candidate.dexId,
          candidate.pairAddress,
          candidate.baseTokenAddress,
          candidate.baseTokenName,
          candidate.baseTokenSymbol,
          candidate.quoteTokenSymbol,
          candidate.url,
          candidate.priceUsd,
          candidate.liquidityUsd,
          candidate.volume24hUsd,
          candidate.marketCap,
          candidate.fdv,
          candidate.pairCreatedAt,
          candidate.matchScore,
          JSON.stringify(candidate.riskFlags),
          JSON.stringify(candidate.matchedTerms),
          JSON.stringify(candidate.rawPayload),
          candidate.discoveredAt,
          candidate.discoveredAt,
          candidate.discoveredAt
        );
      }
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  public getDexDiscoveries(options: { minScore: number; limit: number }): DexTokenCandidateRecord[] {
    const rows = this.dexDiscoveriesStatement.all(options.minScore, options.limit) as Record<string, unknown>[];
    return rows.map(rowToDexTokenCandidate);
  }

  public getDexDiscoveryForPost(postId: string): DexTokenCandidateRecord[] {
    const rows = this.dexDiscoveryForPostStatement.all(postId) as Record<string, unknown>[];
    return rows.map(rowToDexTokenCandidate);
  }

  public getLatestPoll(): PollRunRecord | null {
    const row = this.latestPollStatement.get() as Record<string, unknown> | undefined;
    return row ? rowToPollRun(row) : null;
  }

  public getLatestSuccessfulPoll(): PollRunRecord | null {
    const row = this.latestSuccessfulPollStatement.get() as Record<string, unknown> | undefined;
    return row ? rowToPollRun(row) : null;
  }

  public async getHealthSnapshot(config: Pick<AppConfig, "targetHandle">, now = new Date()): Promise<HealthSnapshot> {
    return getRepositoryHealthSnapshot(this, config, now);
  }
}
