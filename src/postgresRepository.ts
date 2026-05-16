import postgres, { type Sql, type TransactionSql } from "postgres";

import type { AppConfig } from "./config.js";
import { getRepositoryHealthSnapshot, type PostRepository } from "./repository.js";
import type {
  HealthSnapshot,
  MemeSignalAnalysisInput,
  MemeSignalAnalysisPayload,
  MemeSignalAnalysisRecord,
  PollRunInput,
  PollRunRecord,
  StoredPost
} from "./types.js";

function parseJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }

  if (typeof value === "string") {
    return JSON.parse(value) as T;
  }

  return value as T;
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
            ${JSON.stringify(post.media)}::jsonb,
            ${JSON.stringify(post.rawPayload)}::jsonb
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
          ${JSON.stringify(input.metadata ?? {})}::jsonb
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
        ${JSON.stringify(input.analysis ?? emptyMemeSignalPayload)}::jsonb,
        ${input.model},
        ${input.promptVersion},
        ${JSON.stringify(input.rawPayload ?? {})}::jsonb,
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

    this.initialized = true;
  }
}
