import { createVercelRuntime } from "../../../src/deployment.js";
import { json } from "../../../src/http.js";

export async function GET(
  _request: Request,
  context: { params?: { postId?: string } }
): Promise<Response> {
  const runtime = createVercelRuntime();

  try {
    const postId = context.params?.postId;
    if (!postId) {
      return json({ error: "Missing post id" }, { status: 400 });
    }

    const analysis = await runtime.repository.getMemeSignalForPost(postId);
    if (!analysis) {
      return json({ error: "No meme analysis found for post" }, { status: 404 });
    }

    return json(analysis);
  } finally {
    await runtime.repository.close();
  }
}
