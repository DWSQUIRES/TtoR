import { createVercelReadRuntime } from "../../src/deployment.js";
import { errorJson, json } from "../../src/http.js";
import { toCompactPost } from "../../src/postDto.js";

function wantsCompactPost(request: Request): boolean {
  const compact = new URL(request.url).searchParams.get("compact");
  return compact === "1" || compact === "true";
}

export async function GET(request: Request): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const latestPost = await runtime.repository.getLatestPost();
    if (!latestPost) {
      return json({ error: "No posts have been ingested yet" }, { status: 404 });
    }

    return json(wantsCompactPost(request) ? toCompactPost(latestPost) : latestPost);
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
