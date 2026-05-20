import postgres, { type Sql, type TransactionSql } from "postgres";

import type { AppConfig } from "./config.js";
import { getRepositoryHealthSnapshot, type PostRepository } from "./repository.js";
import type {
  DexDiscoveryRunInput,
  DexDiscoveryRunRecord,
  DexDiscoveryStatus,
  DexTokenCandidateInput,
  DexTokenCandidatePriorityReason,
  DexTokenCandidateRecord,
  DexTokenCandidateRiskFlag,
  HealthSnapshot,
  MemeSignalAnalysisInput,
  MemeSignalAnalysisPayload,
  MemeSignalAnalysisRecord,
  MemeSignalStatus,
  PollRunInput,
  PollRunRecord,
  StoredPost
} from "./types.js";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return parseJson(JSON.parse(value), fallback);
  }

  return value as T;
}

type JsonValue = Parameters<Sql["json"]>[0];
type JsonCapableSql = Pick<Sql, "json"> | Pick<TransactionSql, "json">;

function jsonb(sql: JsonCapableSql, value: unknown): ReturnType<Sql["json"]> {
  return sql.json(value as JsonValue);
}

function toIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value);
}

function rowToStoredPost(row: Record<string, unknown>): StoredPost {
  return {
    postId: String(row.post_id),
    authorHandle: String(row.author_handle),
    authorDisplayName: row.author_display_name ? String(row.author_display_name) : null,
    createdAt: row.created_at ? toIso(row.created_at) : null,
    detectedAt: toIso(row.detected_at),
    text: String(row.text),
    lang: row.lang ? String(row.lang) : null,
    conversationId: row.conversation_id ? String(row.conversation_id) : null,
    replyToPostId: row.reply_to_post_id ? String(row.reply_to_post_id) : null,
    quotedPostId: row.quoted_post_id ? String(row.quoted_post_id) : null,
    isRepost: Boolean(row.is_repost),
    media: parseJson(row.media_json, []),
    rawPayload: parseJson(row.raw_payload_json, {}),
    insertedAt: toIso(row.inserted_at)
  };
}

function rowToPollRun(row: Record<string, unknown>): PollRunRecord {
  return {
    id: Number(row.id),
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    status: String(row.status) as PollRunRecord["status"],
    newPostsCount: Number(row.new_posts_count),
    errorCode: row.error_code ? (String(row.error_code) as PollRunRecord["errorCode"]) : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    latestPostId: row.latest_post_id ? String(row.latest_post_id) : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {})
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
  const payload = parseJson<MemeSignalAnalysisPayload>(row.analysis_json, emptyMemeSignalPayload);

  return {
    postId: String(row.post_id),
    status: String(row.status) as MemeSignalAnalysisRecord["status"],
    model: String(row.model),
    promptVersion: String(row.prompt_version),
    rawPayload: parseJson<Record<string, unknown>>(row.raw_payload_json, {}),
    errorMessage: row.error_message ? String(row.error_message) : null,
    createdAt: toIso(row.created_at),
    ...payload
  };
}

function rowToDexDiscoveryRun(row: Record<string, unknown>): DexDiscoveryRunRecord {
  return {
    id: Number(row.id),
    postId: String(row.post_id),
    status: String(row.status) as DexDiscoveryStatus,
    startedAt: toIso(row.started_at),
    finishedAt: toIso(row.finished_at),
    signalCount: Number(row.signal_count),
    candidateCount: Number(row.candidate_count),
    errorCount: Number(row.error_count),
    errorMessage: row.error_message ? String(row.error_message) : null,
    metadata: parseJson<Record<string, unknown>>(row.metadata_json, {})
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
    pairCreatedAt: row.pair_created_at ? toIso(row.pair_created_at) : null,
    matchScore: Number(row.match_score),
    riskFlags: parseJson<DexTokenCandidateRiskFlag[]>(row.risk_flags_json, []),
    matchedTerms: parseJson<string[]>(row.matched_terms_json, []),
    rawPayload: parseJson<Record<string, unknown>>(row.raw_payload_json, {}),
    discoveredAt: toIso(row.discovered_at),
    lastCheckedAt: row.last_checked_at ? toIso(row.last_checked_at) : toIso(row.updated_at ?? row.discovered_at),
    priorityScore: Number(row.priority_score ?? 0),
    priorityReasons: parseJson<DexTokenCandidatePriorityReason[]>(row.priority_reasons_json, []),
    firstPriceUsd: row.first_price_usd === null || row.first_price_usd === undefined ? null : Number(row.first_price_usd),
    firstLiquidityUsd: row.first_liquidity_usd === null || row.first_liquidity_usd === undefined ? null : Number(row.first_liquidity_usd),
    firstVolume24hUsd: row.first_volume_24h_usd === null || row.first_volume_24h_usd === undefined ? null : Number(row.first_volume_24h_usd),
    previousPriceUsd: row.previous_price_usd === null || row.previous_price_usd === undefined ? null : Number(row.previous_price_usd),
    previousLiquidityUsd: row.previous_liquidity_usd === null || row.previous_liquidity_usd === undefined ? null : Number(row.previous_liquidity_usd),
    previousVolume24hUsd: row.previous_volume_24h_usd === null || row.previous_volume_24h_usd === undefined ? null : Number(row.previous_volume_24h_usd),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    signalScore: row.signal_score === null || row.signal_score === undefined ? null : Number(row.signal_score),
    narrative: row.narrative ? String(row.narrative) : null,
    whySignal: row.why_signal ? String(row.why_signal) : null
  };
}

export class PostgresRepository implements PostRepository {
  private initialized = false;

  public constructor(private readonly sql: Sql) {}

  public static fromEnv(env: NodeJS.ProcessEnv = process.env): PostgresRepository {
    const databaseUrl = env.POSTGRES_URL ?? env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("POSTGRES_URL or DATABASE_URL is required for Vercel deployment");
    }

    return new PostgresRepository(
      postgres(databaseUrl, {
        max: 1,
        prepare: false
      })
    );
  }

  public async close(): Promise<void> {
    await this.sql.end({ timeout: 1 });
  }

  public async recordPollRun(input: PollRunInput): Promise<{ newPostsCount: number; latestPostId: string | null }> {
    await this.ensureInitialized();
    const posts = input.posts ?? [];

    return this.sql.begin(async (transaction) => {
      let newPostsCount = 0;

      for (const post of posts) {
        const inserted = await transaction`
          INSERT INTO posts (
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
            ${post.postId},
            ${post.authorHandle},
            ${post.authorDisplayName},
            ${post.createdAt},
            ${post.detectedAt},
            ${post.text},
            ${post.lang},
            ${post.conversationId},
            ${post.replyToPostId},
            ${post.quotedPostId},
            ${post.isRepost},
            ${jsonb(transaction, post.media)},
            ${jsonb(transaction, post.rawPayload)}
          )
          ON CONFLICT (post_id) DO NOTHING
          RETURNING post_id
        `;

        newPostsCount += inserted.count;
      }

      const latestPostId = posts[0]?.postId ?? (await this.getLatestPostWith(transaction))?.postId ?? null;
      await transaction`
        INSERT INTO poll_runs (
          started_at,
          finished_at,
          status,
          new_posts_count,
          error_code,
          error_message,
          latest_post_id,
          metadata_json
        ) VALUES (
          ${input.startedAt},
          ${input.finishedAt},
          ${input.status},
          ${newPostsCount},
          ${input.errorCode ?? null},
          ${input.errorMessage ?? null},
          ${latestPostId},
          ${jsonb(transaction, input.metadata ?? {})}
        )
      `;

      return {
        newPostsCount,
        latestPostId
      };
    });
  }

  public async getLatestPost(): Promise<StoredPost | null> {
    await this.ensureInitialized();
    return this.getLatestPostWith(this.sql);
  }

  public async getPostsSinceDetectedAt(sinceDetectedAt: string): Promise<StoredPost[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT *
      FROM posts
      WHERE detected_at > ${sinceDetectedAt}
      ORDER BY detected_at ASC, post_id ASC
    `;
    return rows.map((row) => rowToStoredPost(row as Record<string, unknown>));
  }

  public async getPostsSinceCreatedAt(sinceCreatedAt: string): Promise<StoredPost[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT *
      FROM posts
      WHERE COALESCE(created_at, detected_at) >= ${sinceCreatedAt}
      ORDER BY COALESCE(created_at, detected_at) ASC, post_id ASC
    `;
    return rows.map((row) => rowToStoredPost(row as Record<string, unknown>));
  }

  public async getUnanalyzedPosts(limit: number): Promise<StoredPost[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT posts.*
      FROM posts
      LEFT JOIN meme_signal_analyses ON meme_signal_analyses.post_id = posts.post_id
      WHERE meme_signal_analyses.post_id IS NULL
      ORDER BY COALESCE(posts.created_at, posts.detected_at) DESC, posts.post_id DESC
      LIMIT ${limit}
    `;
    return rows.map((row) => rowToStoredPost(row as Record<string, unknown>));
  }

  public async saveMemeSignalAnalysis(input: MemeSignalAnalysisInput): Promise<void> {
    await this.ensureInitialized();
    await this.sql`
      INSERT INTO meme_signal_analyses (
        post_id,
        status,
        analysis_json,
        model,
        prompt_version,
        raw_payload_json,
        error_message,
        created_at
      ) VALUES (
        ${input.postId},
        ${input.status},
        ${jsonb(this.sql, input.analysis ?? emptyMemeSignalPayload)},
        ${input.model},
        ${input.promptVersion},
        ${jsonb(this.sql, input.rawPayload ?? {})},
        ${input.errorMessage ?? null},
        ${input.createdAt}
      )
      ON CONFLICT (post_id) DO UPDATE SET
        status = EXCLUDED.status,
        analysis_json = EXCLUDED.analysis_json,
        model = EXCLUDED.model,
        prompt_version = EXCLUDED.prompt_version,
        raw_payload_json = EXCLUDED.raw_payload_json,
        error_message = EXCLUDED.error_message,
        created_at = EXCLUDED.created_at
    `;
  }

  public async getMemeSignals(options: { minScore: number; limit: number }): Promise<MemeSignalAnalysisRecord[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT *
      FROM meme_signal_analyses
      WHERE status = 'success'
        AND (analysis_json->>'hasMemecoinSignal')::boolean = TRUE
        AND (analysis_json->>'signalScore')::integer >= ${options.minScore}
      ORDER BY (analysis_json->>'signalScore')::integer DESC, created_at DESC
      LIMIT ${options.limit}
    `;
    return rows.map((row) => rowToMemeSignalAnalysis(row as Record<string, unknown>));
  }

  public async getMemeAnalyses(options: { status: MemeSignalStatus | null; limit: number }): Promise<MemeSignalAnalysisRecord[]> {
    await this.ensureInitialized();
    const rows = options.status
      ? await this.sql`
          SELECT *
          FROM meme_signal_analyses
          WHERE status = ${options.status}
          ORDER BY created_at DESC
          LIMIT ${options.limit}
        `
      : await this.sql`
          SELECT *
          FROM meme_signal_analyses
          ORDER BY created_at DESC
          LIMIT ${options.limit}
        `;
    return rows.map((row) => rowToMemeSignalAnalysis(row as Record<string, unknown>));
  }

  public async getMemeSignalForPost(postId: string): Promise<MemeSignalAnalysisRecord | null> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT *
      FROM meme_signal_analyses
      WHERE post_id = ${postId}
      LIMIT 1
    `;
    return rows[0] ? rowToMemeSignalAnalysis(rows[0] as Record<string, unknown>) : null;
  }

  public async getSignalsPendingDexDiscovery(options: {
    minScore: number;
    limit: number;
    ttlMinutes: number;
  }): Promise<MemeSignalAnalysisRecord[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT meme_signal_analyses.*
      FROM meme_signal_analyses
      LEFT JOIN (
        SELECT post_id, MAX(finished_at) AS latest_finished_at
        FROM dex_discovery_runs
        GROUP BY post_id
      ) latest_runs ON latest_runs.post_id = meme_signal_analyses.post_id
      WHERE meme_signal_analyses.status = 'success'
        AND (analysis_json->>'hasMemecoinSignal')::boolean = TRUE
        AND (analysis_json->>'signalScore')::integer >= ${options.minScore}
        AND (
          latest_runs.latest_finished_at IS NULL
          OR latest_runs.latest_finished_at <= NOW() - (${options.ttlMinutes}::text || ' minutes')::interval
        )
      ORDER BY (analysis_json->>'signalScore')::integer DESC, meme_signal_analyses.created_at DESC
      LIMIT ${options.limit}
    `;
    return rows.map((row) => rowToMemeSignalAnalysis(row as Record<string, unknown>));
  }

  public async saveDexDiscoveryRun(input: DexDiscoveryRunInput): Promise<DexDiscoveryRunRecord> {
    await this.ensureInitialized();
    const rows = await this.sql`
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
      ) VALUES (
        ${input.postId},
        ${input.status},
        ${input.startedAt},
        ${input.finishedAt},
        ${input.signalCount},
        ${input.candidateCount},
        ${input.errorCount},
        ${input.errorMessage ?? null},
        ${jsonb(this.sql, input.metadata ?? {})}
      )
      RETURNING *
    `;
    return rowToDexDiscoveryRun(rows[0] as Record<string, unknown>);
  }

  public async upsertDexTokenCandidates(postId: string, candidates: DexTokenCandidateInput[]): Promise<void> {
    await this.ensureInitialized();
    await this.sql.begin(async (transaction) => {
      for (const candidate of candidates) {
        await transaction`
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
            first_price_usd,
            first_liquidity_usd,
            first_volume_24h_usd,
            previous_price_usd,
            previous_liquidity_usd,
            previous_volume_24h_usd,
            last_checked_at,
            priority_score,
            priority_reasons_json,
            updated_at
          ) VALUES (
            ${postId},
            ${candidate.chainId},
            ${candidate.dexId},
            ${candidate.pairAddress},
            ${candidate.baseTokenAddress},
            ${candidate.baseTokenName},
            ${candidate.baseTokenSymbol},
            ${candidate.quoteTokenSymbol},
            ${candidate.url},
            ${candidate.priceUsd},
            ${candidate.liquidityUsd},
            ${candidate.volume24hUsd},
            ${candidate.marketCap},
            ${candidate.fdv},
            ${candidate.pairCreatedAt ?? null},
            ${candidate.matchScore},
            ${jsonb(transaction, candidate.riskFlags)},
            ${jsonb(transaction, candidate.matchedTerms)},
            ${jsonb(transaction, candidate.rawPayload)},
            ${candidate.discoveredAt},
            ${candidate.priceUsd},
            ${candidate.liquidityUsd},
            ${candidate.volume24hUsd},
            ${null},
            ${null},
            ${null},
            ${candidate.lastCheckedAt},
            ${candidate.priorityScore},
            ${jsonb(transaction, candidate.priorityReasons)},
            ${candidate.discoveredAt}
          )
          ON CONFLICT (post_id, chain_id, pair_address) DO UPDATE SET
            dex_id = EXCLUDED.dex_id,
            base_token_address = EXCLUDED.base_token_address,
            base_token_name = EXCLUDED.base_token_name,
            base_token_symbol = EXCLUDED.base_token_symbol,
            quote_token_symbol = EXCLUDED.quote_token_symbol,
            url = EXCLUDED.url,
            price_usd = EXCLUDED.price_usd,
            liquidity_usd = EXCLUDED.liquidity_usd,
            volume_24h_usd = EXCLUDED.volume_24h_usd,
            market_cap = EXCLUDED.market_cap,
            fdv = EXCLUDED.fdv,
            pair_created_at = EXCLUDED.pair_created_at,
            match_score = EXCLUDED.match_score,
            risk_flags_json = EXCLUDED.risk_flags_json,
            matched_terms_json = EXCLUDED.matched_terms_json,
            raw_payload_json = EXCLUDED.raw_payload_json,
            previous_price_usd = dex_token_candidates.price_usd,
            previous_liquidity_usd = dex_token_candidates.liquidity_usd,
            previous_volume_24h_usd = dex_token_candidates.volume_24h_usd,
            last_checked_at = EXCLUDED.last_checked_at,
            priority_score = EXCLUDED.priority_score,
            priority_reasons_json = EXCLUDED.priority_reasons_json,
            updated_at = EXCLUDED.updated_at
        `;
      }
    });
  }

  public async getDexCandidatesPendingRefresh(options: {
    limit: number;
    ttlMinutes: number;
  }): Promise<DexTokenCandidateRecord[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT
        dex_token_candidates.*,
        (meme_signal_analyses.analysis_json->>'signalScore')::integer AS signal_score,
        meme_signal_analyses.analysis_json->>'narrative' AS narrative,
        meme_signal_analyses.analysis_json->>'whySignal' AS why_signal
      FROM dex_token_candidates
      LEFT JOIN meme_signal_analyses ON meme_signal_analyses.post_id = dex_token_candidates.post_id
      WHERE last_checked_at <= NOW() - (${options.ttlMinutes}::text || ' minutes')::interval
      ORDER BY priority_score DESC, last_checked_at ASC
      LIMIT ${options.limit}
    `;
    return rows.map((row) => rowToDexTokenCandidate(row as Record<string, unknown>));
  }

  public async getDexDiscoveries(options: { minScore: number; limit: number }): Promise<DexTokenCandidateRecord[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT
        dex_token_candidates.*,
        (meme_signal_analyses.analysis_json->>'signalScore')::integer AS signal_score,
        meme_signal_analyses.analysis_json->>'narrative' AS narrative,
        meme_signal_analyses.analysis_json->>'whySignal' AS why_signal
      FROM dex_token_candidates
      JOIN meme_signal_analyses ON meme_signal_analyses.post_id = dex_token_candidates.post_id
      WHERE match_score >= ${options.minScore}
      ORDER BY priority_score DESC, match_score DESC, COALESCE(liquidity_usd, 0) DESC, discovered_at DESC
      LIMIT ${options.limit}
    `;
    return rows.map((row) => rowToDexTokenCandidate(row as Record<string, unknown>));
  }

  public async getDexDiscoveryForPost(postId: string): Promise<DexTokenCandidateRecord[]> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT
        dex_token_candidates.*,
        (meme_signal_analyses.analysis_json->>'signalScore')::integer AS signal_score,
        meme_signal_analyses.analysis_json->>'narrative' AS narrative,
        meme_signal_analyses.analysis_json->>'whySignal' AS why_signal
      FROM dex_token_candidates
      LEFT JOIN meme_signal_analyses ON meme_signal_analyses.post_id = dex_token_candidates.post_id
      WHERE dex_token_candidates.post_id = ${postId}
      ORDER BY priority_score DESC, match_score DESC, COALESCE(liquidity_usd, 0) DESC, discovered_at DESC
    `;
    return rows.map((row) => rowToDexTokenCandidate(row as Record<string, unknown>));
  }

  public async getLatestPoll(): Promise<PollRunRecord | null> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT *
      FROM poll_runs
      ORDER BY finished_at DESC, id DESC
      LIMIT 1
    `;
    return rows[0] ? rowToPollRun(rows[0] as Record<string, unknown>) : null;
  }

  public async getLatestSuccessfulPoll(): Promise<PollRunRecord | null> {
    await this.ensureInitialized();
    const rows = await this.sql`
      SELECT *
      FROM poll_runs
      WHERE status = 'success'
      ORDER BY finished_at DESC, id DESC
      LIMIT 1
    `;
    return rows[0] ? rowToPollRun(rows[0] as Record<string, unknown>) : null;
  }

  public async getHealthSnapshot(config: Pick<AppConfig, "targetHandle">, now = new Date()): Promise<HealthSnapshot> {
    return getRepositoryHealthSnapshot(this, config, now);
  }

  private async getLatestPostWith(sql: Sql | TransactionSql): Promise<StoredPost | null> {
    const rows = await sql`
      SELECT *
      FROM posts
      ORDER BY COALESCE(created_at, detected_at) DESC, post_id DESC
      LIMIT 1
    `;
    return rows[0] ? rowToStoredPost(rows[0] as Record<string, unknown>) : null;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initialized) {
      return;
    }

    await this.sql`
      CREATE TABLE IF NOT EXISTS posts (
        post_id TEXT PRIMARY KEY,
        author_handle TEXT NOT NULL,
        author_display_name TEXT,
        created_at TIMESTAMPTZ,
        detected_at TIMESTAMPTZ NOT NULL,
        text TEXT NOT NULL,
        lang TEXT,
        conversation_id TEXT,
        reply_to_post_id TEXT,
        quoted_post_id TEXT,
        is_repost BOOLEAN NOT NULL DEFAULT FALSE,
        media_json JSONB NOT NULL,
        raw_payload_json JSONB NOT NULL,
        inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_posts_detected_at ON posts(detected_at DESC)`;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC)`;
    await this.sql`
      CREATE TABLE IF NOT EXISTS poll_runs (
        id BIGSERIAL PRIMARY KEY,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ NOT NULL,
        status TEXT NOT NULL,
        new_posts_count INTEGER NOT NULL,
        error_code TEXT,
        error_message TEXT,
        latest_post_id TEXT,
        metadata_json JSONB NOT NULL
      )
    `;
    await this.sql`CREATE INDEX IF NOT EXISTS idx_poll_runs_finished_at ON poll_runs(finished_at DESC)`;
    await this.sql`
      CREATE TABLE IF NOT EXISTS meme_signal_analyses (
        post_id TEXT PRIMARY KEY REFERENCES posts(post_id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        analysis_json JSONB NOT NULL,
        model TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        raw_payload_json JSONB NOT NULL,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_meme_signal_analyses_score
      ON meme_signal_analyses (((analysis_json->>'signalScore')::integer) DESC)
      WHERE status = 'success'
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS dex_discovery_runs (
        id BIGSERIAL PRIMARY KEY,
        post_id TEXT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
        status TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        finished_at TIMESTAMPTZ NOT NULL,
        signal_count INTEGER NOT NULL,
        candidate_count INTEGER NOT NULL,
        error_count INTEGER NOT NULL,
        error_message TEXT,
        metadata_json JSONB NOT NULL
      )
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_dex_discovery_runs_post_finished
      ON dex_discovery_runs(post_id, finished_at DESC)
    `;
    await this.sql`
      CREATE TABLE IF NOT EXISTS dex_token_candidates (
        post_id TEXT NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
        chain_id TEXT NOT NULL,
        dex_id TEXT NOT NULL,
        pair_address TEXT NOT NULL,
        base_token_address TEXT NOT NULL,
        base_token_name TEXT NOT NULL,
        base_token_symbol TEXT NOT NULL,
        quote_token_symbol TEXT,
        url TEXT NOT NULL,
        price_usd DOUBLE PRECISION,
        liquidity_usd DOUBLE PRECISION,
        volume_24h_usd DOUBLE PRECISION,
        market_cap DOUBLE PRECISION,
        fdv DOUBLE PRECISION,
        pair_created_at TIMESTAMPTZ,
        match_score INTEGER NOT NULL,
        risk_flags_json JSONB NOT NULL,
        matched_terms_json JSONB NOT NULL,
        raw_payload_json JSONB NOT NULL,
        discovered_at TIMESTAMPTZ NOT NULL,
        first_price_usd DOUBLE PRECISION,
        first_liquidity_usd DOUBLE PRECISION,
        first_volume_24h_usd DOUBLE PRECISION,
        previous_price_usd DOUBLE PRECISION,
        previous_liquidity_usd DOUBLE PRECISION,
        previous_volume_24h_usd DOUBLE PRECISION,
        last_checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        priority_score INTEGER NOT NULL DEFAULT 0,
        priority_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (post_id, chain_id, pair_address)
      )
    `;
    await this.ensureDexTokenCandidateColumns();
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_dex_token_candidates_score
      ON dex_token_candidates(match_score DESC, discovered_at DESC)
    `;
    await this.sql`
      CREATE INDEX IF NOT EXISTS idx_dex_token_candidates_refresh
      ON dex_token_candidates(last_checked_at ASC, priority_score DESC)
    `;
    await this.normalizeLegacyJsonbRows();

    this.initialized = true;
  }

  private async ensureDexTokenCandidateColumns(): Promise<void> {
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS first_price_usd DOUBLE PRECISION`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS first_liquidity_usd DOUBLE PRECISION`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS first_volume_24h_usd DOUBLE PRECISION`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS previous_price_usd DOUBLE PRECISION`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS previous_liquidity_usd DOUBLE PRECISION`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS previous_volume_24h_usd DOUBLE PRECISION`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS priority_score INTEGER NOT NULL DEFAULT 0`;
    await this.sql`ALTER TABLE dex_token_candidates ADD COLUMN IF NOT EXISTS priority_reasons_json JSONB NOT NULL DEFAULT '[]'::jsonb`;
    await this.sql`
      UPDATE dex_token_candidates
      SET
        first_price_usd = COALESCE(first_price_usd, price_usd),
        first_liquidity_usd = COALESCE(first_liquidity_usd, liquidity_usd),
        first_volume_24h_usd = COALESCE(first_volume_24h_usd, volume_24h_usd),
        last_checked_at = COALESCE(last_checked_at, updated_at, discovered_at)
      WHERE first_price_usd IS NULL
        OR first_liquidity_usd IS NULL
        OR first_volume_24h_usd IS NULL
        OR last_checked_at IS NULL
    `;
    await this.sql`ALTER TABLE dex_token_candidates ALTER COLUMN last_checked_at SET NOT NULL`;
    await this.sql`ALTER TABLE dex_token_candidates ALTER COLUMN last_checked_at SET DEFAULT NOW()`;
  }

  private async normalizeLegacyJsonbRows(): Promise<void> {
    await this.sql`
      UPDATE posts
      SET media_json = (media_json #>> '{}')::jsonb
      WHERE jsonb_typeof(media_json) = 'string'
    `;
    await this.sql`
      UPDATE posts
      SET raw_payload_json = (raw_payload_json #>> '{}')::jsonb
      WHERE jsonb_typeof(raw_payload_json) = 'string'
    `;
    await this.sql`
      UPDATE poll_runs
      SET metadata_json = (metadata_json #>> '{}')::jsonb
      WHERE jsonb_typeof(metadata_json) = 'string'
    `;
    await this.sql`
      UPDATE meme_signal_analyses
      SET analysis_json = (analysis_json #>> '{}')::jsonb
      WHERE jsonb_typeof(analysis_json) = 'string'
    `;
    await this.sql`
      UPDATE meme_signal_analyses
      SET raw_payload_json = (raw_payload_json #>> '{}')::jsonb
      WHERE jsonb_typeof(raw_payload_json) = 'string'
    `;
    await this.sql`
      UPDATE dex_discovery_runs
      SET metadata_json = (metadata_json #>> '{}')::jsonb
      WHERE jsonb_typeof(metadata_json) = 'string'
    `;
    await this.sql`
      UPDATE dex_token_candidates
      SET risk_flags_json = (risk_flags_json #>> '{}')::jsonb
      WHERE jsonb_typeof(risk_flags_json) = 'string'
    `;
    await this.sql`
      UPDATE dex_token_candidates
      SET matched_terms_json = (matched_terms_json #>> '{}')::jsonb
      WHERE jsonb_typeof(matched_terms_json) = 'string'
    `;
    await this.sql`
      UPDATE dex_token_candidates
      SET raw_payload_json = (raw_payload_json #>> '{}')::jsonb
      WHERE jsonb_typeof(raw_payload_json) = 'string'
    `;
  }
}
