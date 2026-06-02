import type { SseEvent } from "@repo/api";
import Redis from "ioredis";
import superjson from "superjson";
import { env } from "./env";

const redisPublisher = new Redis(env.REDIS_URL);

redisPublisher.on("error", (err) => {
  console.error("[redis-publisher] error:", err.message);
});

export function publishEvent(userId: string, event: SseEvent): void {
  void redisPublisher
    .publish(`events:${userId}`, superjson.stringify(event))
    .catch((err) => console.error("[redis-publisher] publish failed:", err.message));
}

export async function closeRedisPublisher(): Promise<void> {
  await redisPublisher.quit();
}
