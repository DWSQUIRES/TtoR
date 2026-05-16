import { createVercelReadRuntime } from "../src/deployment.js";
import { errorJson, json } from "../src/http.js";

export async function GET(): Promise<Response> {
  let runtime: ReturnType<typeof createVercelReadRuntime> | null = null;

  try {
    runtime = createVercelReadRuntime();
    return json(await runtime.repository.getHealthSnapshot(runtime.config));
  } catch (error) {
    return errorJson(error);
  } finally {
    await runtime?.repository.close();
  }
}
