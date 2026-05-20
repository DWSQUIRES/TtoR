import { createVercelReadRuntime } from "../../../src/deployment.js";
import { errorJson, json } from "../../../src/http.js";

function getPostIdFromRequest(request: Request, context: { params?: { postId?: string } }): string | null {
  if (context.params?.postId) {
    return context.params.postId;
  }

  const match = new URL(request.url).pathname.match(/\/api\/posts\/([^/]+)\/dex-discovery$/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function GET(
  request: Request,
  context: { params?: { postId?: string } }
): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const postId = getPostIdFromRequest(request, context);
    if (!postId) {
      return json({ error: "Missing post id" }, { status: 400 });
    }

    const candidates = await runtime.repository.getDexDiscoveryForPost(postId);
    if (candidates.length === 0) {
      return json({ error: "No DEX discovery found for post" }, { status: 404 });
    }

    return json(candidates);
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
