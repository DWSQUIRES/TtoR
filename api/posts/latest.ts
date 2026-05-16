import { createVercelReadRuntime } from "../../src/deployment.js";
import { errorJson, json } from "../../src/http.js";

export async function GET(): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const latestPost = await runtime.repository.getLatestPost();
    if (!latestPost) {
      return json({ error: "No posts have been ingested yet" }, { status: 404 });
    }

    return json(latestPost);
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
