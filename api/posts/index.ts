import { createVercelReadRuntime } from "../../src/deployment.js";
import { errorJson, json } from "../../src/http.js";

export async function GET(request: Request): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const url = new URL(request.url);
    const sinceDetectedAt = url.searchParams.get("since_detected_at");
    const sinceCreatedAt = url.searchParams.get("since_created_at");

    if (!sinceDetectedAt && !sinceCreatedAt) {
      return json({ error: "since_detected_at or since_created_at query parameter is required" }, { status: 400 });
    }

    if (sinceDetectedAt && sinceCreatedAt) {
      return json({ error: "Use only one of since_detected_at or since_created_at" }, { status: 400 });
    }

    const since = sinceCreatedAt ?? sinceDetectedAt;
    const parsedDate = since ? Date.parse(since) : Number.NaN;
    if (Number.isNaN(parsedDate)) {
      return json({ error: "Timestamp query parameter must be an ISO timestamp" }, { status: 400 });
    }

    const normalizedSince = new Date(parsedDate).toISOString();
    const posts = sinceCreatedAt
      ? await runtime.repository.getPostsSinceCreatedAt(normalizedSince)
      : await runtime.repository.getPostsSinceDetectedAt(normalizedSince);

    return json(posts);
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
