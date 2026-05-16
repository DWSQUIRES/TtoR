import { createVercelRuntime } from "../../src/deployment.js";
import { json } from "../../src/http.js";

export async function GET(): Promise<Response> {
  const runtime = createVercelRuntime();

  try {
    const latestPost = await runtime.repository.getLatestPost();
    if (!latestPost) {
      return json({ error: "No posts have been ingested yet" }, { status: 404 });
    }

    return json(latestPost);
  } finally {
    await runtime.repository.close();
  }
}
