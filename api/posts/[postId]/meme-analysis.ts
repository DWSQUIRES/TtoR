import { createVercelReadRuntime } from "../../../src/deployment.js";
import { errorJson, json } from "../../../src/http.js";

export async function GET(
  _request: Request,
  context: { params?: { postId?: string } }
): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    const postId = context.params?.postId;
    if (!postId) {
      return json({ error: "Missing post id" }, { status: 400 });
    }

    const analysis = await runtime.repository.getMemeSignalForPost(postId);
    if (!analysis) {
      return json({ error: "No meme analysis found for post" }, { status: 404 });
    }

    return json(analysis);
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
