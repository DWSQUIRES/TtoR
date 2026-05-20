import { createLogger } from "../../src/logger.js";
import { createVercelDexDiscoveryRuntime, isAuthorizedCronRequest } from "../../src/deployment.js";
import { json } from "../../src/http.js";

export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  const runtime = createVercelDexDiscoveryRuntime();
  const logger = createLogger(runtime.config.logLevel);

  try {
    if (!isAuthorizedCronRequest(request, runtime.config)) {
      return json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!runtime.dexDiscoveryService) {
      return json({ status: "disabled" });
    }

    const summary = await runtime.dexDiscoveryService.discoverPendingSignals();
    logger.info("DEX discovery cron completed", { ...summary });
    return json({ status: "success", ...summary });
  } finally {
    await runtime.repository.close();
  }
}
