import { createVercelReadRuntime } from "../../src/deployment.js";
import { errorJson, json, parseBoundedInteger } from "../../src/http.js";

export async function GET(request: Request): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const url = new URL(request.url);
    const minScore = parseBoundedInteger(url.searchParams.get("min_score"), 0, 0, 100);
    const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    return json(await runtime.repository.getDexDiscoveries({ minScore, limit }));
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
