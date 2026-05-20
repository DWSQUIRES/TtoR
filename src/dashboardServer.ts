import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, resolve, sep } from "node:path";
import "dotenv/config";

import { ensureRuntimeDirs, loadConfig } from "./config.js";
import { parseAnalysisStatus, parseBoundedInteger } from "./http.js";
import { createLogger } from "./logger.js";
import { toCompactPost } from "./postDto.js";
import { Repository } from "./storage.js";

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

function dashboardPort(): number {
  const raw = process.env.DASHBOARD_PORT ?? process.env.PORT ?? "3000";
  const port = Number.parseInt(raw, 10);
  return Number.isFinite(port) && port > 0 ? port : 3000;
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(body, null, 2));
}

function sendMethodNotAllowed(response: ServerResponse): void {
  sendJson(response, 405, { error: "Method not allowed" });
}

function dashboardApiBaseUrl(): URL | null {
  const raw = process.env.DASHBOARD_API_BASE_URL ?? process.env.DEPLOYED_API_BASE_URL;
  if (!raw) {
    return null;
  }

  return new URL(raw.endsWith("/") ? raw : `${raw}/`);
}

async function proxyApiRequest(
  apiBaseUrl: URL,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> {
  const upstreamUrl = new URL(url.pathname + url.search, apiBaseUrl);
  const upstreamResponse = await fetch(upstreamUrl, {
    headers: {
      accept: request.headers.accept ?? "application/json"
    },
    method: request.method
  });
  const body = Buffer.from(await upstreamResponse.arrayBuffer());

  response.writeHead(upstreamResponse.status, {
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
    "content-type": upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8"
  });
  response.end(body);
}

async function handleApiRequest(
  repository: Repository,
  config: ReturnType<typeof loadConfig>,
  request: IncomingMessage,
  response: ServerResponse,
  url: URL
): Promise<void> {
  if (request.method !== "GET") {
    sendMethodNotAllowed(response);
    return;
  }

  const pathname = url.pathname.replace(/^\/api/, "") || "/";

  if (pathname === "/health") {
    sendJson(response, 200, await repository.getHealthSnapshot(config));
    return;
  }

  if (pathname === "/posts/latest") {
    const latestPost = repository.getLatestPost();
    if (!latestPost) {
      sendJson(response, 404, { error: "No posts have been ingested yet" });
      return;
    }

    const compact = url.searchParams.get("compact");
    sendJson(response, 200, compact === "1" || compact === "true" ? toCompactPost(latestPost) : latestPost);
    return;
  }

  if (pathname === "/posts") {
    const sinceDetectedAt = url.searchParams.get("since_detected_at");
    const sinceCreatedAt = url.searchParams.get("since_created_at");
    const since = sinceCreatedAt ?? sinceDetectedAt;

    if (!since || (sinceCreatedAt && sinceDetectedAt)) {
      sendJson(response, 400, { error: "Use exactly one of since_detected_at or since_created_at" });
      return;
    }

    const parsedDate = Date.parse(since);
    if (Number.isNaN(parsedDate)) {
      sendJson(response, 400, { error: "Timestamp query parameter must be an ISO timestamp" });
      return;
    }

    const normalizedSince = new Date(parsedDate).toISOString();
    sendJson(
      response,
      200,
      sinceCreatedAt
        ? repository.getPostsSinceCreatedAt(normalizedSince)
        : repository.getPostsSinceDetectedAt(normalizedSince)
    );
    return;
  }

  if (pathname === "/meme-signals") {
    const minScore = parseBoundedInteger(url.searchParams.get("min_score"), config.memeSignalThreshold, 0, 100);
    const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    sendJson(response, 200, repository.getMemeSignals({ minScore, limit }));
    return;
  }

  if (pathname === "/meme-analyses") {
    const status = parseAnalysisStatus(url.searchParams.get("status"));
    const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    sendJson(response, 200, repository.getMemeAnalyses({ status, limit }));
    return;
  }

  if (pathname === "/dex-discoveries") {
    const minScore = parseBoundedInteger(url.searchParams.get("min_score"), 0, 0, 100);
    const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    sendJson(response, 200, repository.getDexDiscoveries({ minScore, limit }));
    return;
  }

  const memeAnalysisMatch = pathname.match(/^\/posts\/([^/]+)\/meme-analysis$/);
  if (memeAnalysisMatch) {
    const analysis = repository.getMemeSignalForPost(decodeURIComponent(memeAnalysisMatch[1]));
    if (!analysis) {
      sendJson(response, 404, { error: "No meme analysis found for post" });
      return;
    }

    sendJson(response, 200, analysis);
    return;
  }

  const dexDiscoveryMatch = pathname.match(/^\/posts\/([^/]+)\/dex-discovery$/);
  if (dexDiscoveryMatch) {
    const candidates = repository.getDexDiscoveryForPost(decodeURIComponent(dexDiscoveryMatch[1]));
    if (candidates.length === 0) {
      sendJson(response, 404, { error: "No DEX discovery found for post" });
      return;
    }

    sendJson(response, 200, candidates);
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

async function serveStatic(publicDir: string, response: ServerResponse, pathname: string): Promise<void> {
  const decodedPath = decodeURIComponent(pathname === "/" ? "/index.html" : pathname);
  const filePath = resolve(publicDir, `.${decodedPath}`);
  const publicRoot = publicDir.endsWith(sep) ? publicDir : `${publicDir}${sep}`;

  if (filePath !== publicDir && !filePath.startsWith(publicRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "content-type": CONTENT_TYPES[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  ensureRuntimeDirs(config);
  const logger = createLogger(config.logLevel);
  const repository = Repository.open(config.databasePath);
  const publicDir = resolve(process.cwd(), "public");
  const host = process.env.DASHBOARD_HOST ?? "127.0.0.1";
  const port = dashboardPort();
  const apiBaseUrl = dashboardApiBaseUrl();

  const server = createServer((request, response) => {
    void (async () => {
      if (!request.url) {
        sendJson(response, 400, { error: "Missing request URL" });
        return;
      }

      const url = new URL(request.url, `http://${host}:${port}`);
      if (url.pathname.startsWith("/api/")) {
        if (apiBaseUrl) {
          await proxyApiRequest(apiBaseUrl, request, response, url);
          return;
        }

        await handleApiRequest(repository, config, request, response, url);
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        sendMethodNotAllowed(response);
        return;
      }

      await serveStatic(publicDir, response, url.pathname);
    })().catch((error: unknown) => {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Internal server error"
      });
    });
  });

  const shutdown = (): void => {
    logger.info("Stopping dashboard server");
    server.close();
    repository.close();
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  server.listen(port, host, () => {
    logger.info("Dashboard server listening", { apiBaseUrl: apiBaseUrl?.origin, host, port });
    console.log(`TtoR dashboard: http://${host}:${port}`);
    if (apiBaseUrl) {
      console.log(`Proxying /api to: ${apiBaseUrl.origin}`);
    }
  });
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
