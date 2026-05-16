import { createVercelRuntime } from "../../src/deployment.js";
import { json, parseBoundedInteger } from "../../src/http.js";

export async function GET(request: Request): Promise<Response> {
  const runtime = createVercelRuntime();

  try {
    const url = new URL(request.url);
    const minScore = parseBoundedInteger(url.searchParams.get("min_score"), runtime.config.memeSignalThreshold, 0, 100);
    const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    return json(await runtime.repository.getMemeSignals({ minScore, limit }));
  } finally {
    await runtime.repository.close();
  }
}
