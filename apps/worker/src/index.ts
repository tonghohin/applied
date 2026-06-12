import "./otel"; // must be first — registers LangfuseSpanProcessor before other imports

import { browserManager } from "@repo/automation";
import { closeRedisPublisher } from "./redis";
import { searchSchedulerQueue, syncAllSearchSchedulers } from "./schedule-sync";
import { applyWorker } from "./workers/apply.worker";
import { searchWorker } from "./workers/search.worker";

console.log("[worker] Search and apply workers started");

syncAllSearchSchedulers()
  .then(() => console.log("[worker] Search schedulers synced"))
  .catch((err) => console.error("[worker] Failed to sync search schedulers:", err));

async function shutdown() {
  console.log("[worker] Shutting down...");
  await Promise.all([
    searchWorker.close(),
    applyWorker.close(),
    searchSchedulerQueue.close(),
    browserManager.close(),
    closeRedisPublisher(),
  ]);
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
