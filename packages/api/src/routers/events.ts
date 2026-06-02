import superjson from "superjson";
import { createRedisSubscriber } from "../redis";
import type { SseEvent } from "../sse";
import { protectedProcedure, router } from "../trpc";

export const eventsRouter = router({
  onUpdate: protectedProcedure.subscription(async function* ({ ctx }) {
    const subscriber = createRedisSubscriber();
    const channel = `events:${ctx.session.user.id}`;

    const queue: SseEvent[] = [];
    let wakeUp: (() => void) | null = null;

    subscriber.on("message", (_channel: string, message: string) => {
      queue.push(superjson.parse<SseEvent>(message));
      wakeUp?.();
      wakeUp = null;
    });

    await subscriber.subscribe(channel);

    try {
      while (true) {
        const next = queue.shift();
        if (next !== undefined) {
          yield next;
        } else {
          await new Promise<void>((resolve) => {
            wakeUp = resolve;
          });
        }
      }
    } finally {
      await subscriber.unsubscribe(channel).catch(() => {});
      subscriber.disconnect();
    }
  }),
});
