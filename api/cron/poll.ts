import { createLogger } from "../../src/logger.js";
import { createVercelRuntime, isAuthorizedCronRequest } from "../../src/deployment.js";
import { json } from "../../src/http.js";
import { PollingWorker } from "../../src/worker.js";

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const runtime = createVercelRuntime();
  const logger = createLogger(runtime.config.logLevel);

  try {
    if (!isAuthorizedCronRequest(request, runtime.config)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    const worker = new PollingWorker(
      runtime.config,
      runtime.repository,
      runtime.scraper,
      logger,
      runtime.memeSignalService
    );
    const summary = await worker.runCycle();
    return json(summary);
  } finally {
    await runtime.scraper.close();
    await runtime.repository.close();
  }
}
