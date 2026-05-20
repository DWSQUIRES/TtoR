import { createServer, type Server } from "node:http";

import type { AppConfig } from "./config.js";
import { parseAnalysisStatus, parseBoundedInteger } from "./http.js";
import type { Logger } from "./logger.js";
import { toCompactPost } from "./postDto.js";
import type { PostRepository } from "./repository.js";

function jsonResponse(statusCode: number, body: unknown): ResponseInit {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8"
    },
    body: JSON.stringify(body, null, 2)
  };
}

interface ResponseInit {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

function send(response: import("node:http").ServerResponse, init: ResponseInit): void {
  response.writeHead(init.statusCode, init.headers);
  response.end(init.body);
}

export function startApiServer(
  repository: PostRepository,
  config: AppConfig,
  logger: Logger
): Promise<Server> {
  const server = createServer((request, response) => {
    void handleApiRequest(repository, config, request, response);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.apiPort, config.apiHost, () => {
      logger.info("API server listening", {
        host: config.apiHost,
        port: config.apiPort
      });
      server.off("error", reject);
      resolve(server);
    });
  });
}

async function handleApiRequest(
  repository: PostRepository,
  config: AppConfig,
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse
): Promise<void> {
  try {
    if (!request.url || !request.method) {
      send(response, jsonResponse(400, { error: "Missing request URL" }));
      return;
    }

    const url = new URL(request.url, `http://${config.apiHost}:${config.apiPort}`);

    if (request.method !== "GET") {
      send(response, jsonResponse(405, { error: "Method not allowed" }));
      return;
    }

    if (url.pathname === "/health") {
      send(response, jsonResponse(200, await repository.getHealthSnapshot(config)));
      return;
    }

    if (url.pathname === "/posts/latest") {
      const latestPost = await repository.getLatestPost();
      if (!latestPost) {
        send(response, jsonResponse(404, { error: "No posts have been ingested yet" }));
        return;
      }

      const compact = url.searchParams.get("compact");
      send(response, jsonResponse(200, compact === "1" || compact === "true" ? toCompactPost(latestPost) : latestPost));
      return;
    }

    if (url.pathname === "/posts") {
      const sinceDetectedAt = url.searchParams.get("since_detected_at");
      const sinceCreatedAt = url.searchParams.get("since_created_at");
      if (!sinceDetectedAt && !sinceCreatedAt) {
        send(response, jsonResponse(400, { error: "since_detected_at or since_created_at query parameter is required" }));
        return;
      }

      if (sinceDetectedAt && sinceCreatedAt) {
        send(response, jsonResponse(400, { error: "Use only one of since_detected_at or since_created_at" }));
        return;
      }

      const since = sinceCreatedAt ?? sinceDetectedAt;
      const parsedDate = since ? Date.parse(since) : Number.NaN;
      if (Number.isNaN(parsedDate)) {
        send(response, jsonResponse(400, { error: "Timestamp query parameter must be an ISO timestamp" }));
        return;
      }

      const normalizedSince = new Date(parsedDate).toISOString();
      const posts = sinceCreatedAt
        ? await repository.getPostsSinceCreatedAt(normalizedSince)
        : await repository.getPostsSinceDetectedAt(normalizedSince);

      send(response, jsonResponse(200, posts));
      return;
    }

    if (url.pathname === "/meme-signals") {
      const minScore = parseBoundedInteger(url.searchParams.get("min_score"), config.memeSignalThreshold, 0, 100);
      const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
      send(response, jsonResponse(200, await repository.getMemeSignals({ minScore, limit })));
      return;
    }

    if (url.pathname === "/meme-analyses") {
      const status = parseAnalysisStatus(url.searchParams.get("status"));
      const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
      send(response, jsonResponse(200, await repository.getMemeAnalyses({ status, limit })));
      return;
    }

    if (url.pathname === "/dex-discoveries") {
      const minScore = parseBoundedInteger(url.searchParams.get("min_score"), 0, 0, 100);
      const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
      send(response, jsonResponse(200, await repository.getDexDiscoveries({ minScore, limit })));
      return;
    }

    const memeAnalysisMatch = url.pathname.match(/^\/posts\/([^/]+)\/meme-analysis$/);
    if (memeAnalysisMatch) {
      const analysis = await repository.getMemeSignalForPost(decodeURIComponent(memeAnalysisMatch[1]));
      if (!analysis) {
        send(response, jsonResponse(404, { error: "No meme analysis found for post" }));
        return;
      }

      send(response, jsonResponse(200, analysis));
      return;
    }

    const dexDiscoveryMatch = url.pathname.match(/^\/posts\/([^/]+)\/dex-discovery$/);
    if (dexDiscoveryMatch) {
      const candidates = await repository.getDexDiscoveryForPost(decodeURIComponent(dexDiscoveryMatch[1]));
      if (candidates.length === 0) {
        send(response, jsonResponse(404, { error: "No DEX discovery found for post" }));
        return;
      }

      send(response, jsonResponse(200, candidates));
      return;
    }

    send(response, jsonResponse(404, { error: "Not found" }));
  } catch (error) {
    send(
      response,
      jsonResponse(500, {
        error: error instanceof Error ? error.message : "Internal server error"
      })
    );
  }
}
