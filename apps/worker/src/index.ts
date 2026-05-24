import { applyWorker } from "./workers/apply.worker";
import { searchWorker } from "./workers/search.worker";

console.log("[worker] Search and apply workers started");

async function shutdown() {
  console.log("[worker] Shutting down...");
  await Promise.all([searchWorker.close(), applyWorker.close()]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
