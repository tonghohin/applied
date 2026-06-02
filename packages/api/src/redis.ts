import Redis from "ioredis";
import { env } from "./env";

export function createRedisSubscriber(): Redis {
  const subscriber = new Redis(env.REDIS_URL);
  subscriber.on("error", (err) => {
    console.error("[redis-subscriber] error:", err.message);
  });
  return subscriber;
}
