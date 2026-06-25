import Redis from "ioredis";

export function createRedisSubscriber(): Redis {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required");
  const subscriber = new Redis(url);
  subscriber.on("error", (err) => {
    console.error("[redis-subscriber] error:", err.message);
  });
  return subscriber;
}
