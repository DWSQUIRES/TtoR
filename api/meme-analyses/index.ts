import { createVercelReadRuntime } from "../../src/deployment.js";
import { errorJson, json, parseAnalysisStatus, parseBoundedInteger } from "../../src/http.js";

export async function GET(request: Request): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const url = new URL(request.url);
    const status = parseAnalysisStatus(url.searchParams.get("status"));
    const limit = parseBoundedInteger(url.searchParams.get("limit"), 50, 1, 200);
    return json(await runtime.repository.getMemeAnalyses({ status, limit }));
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
