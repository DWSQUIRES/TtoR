import { createVercelRuntime } from "../src/deployment.js";
import { json } from "../src/http.js";

export async function GET(): Promise<Response> {
  const runtime = createVercelRuntime();

  try {
    return json(await runtime.repository.getHealthSnapshot(runtime.config));
  } finally {
    await runtime.repository.close();
  }
}
