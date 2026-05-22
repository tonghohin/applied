import { serve } from "@hono/node-server";
import { appRouter, auth, createContext } from "@repo/api";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { env } from "./env.js";

const app = new Hono();

app.use(
  "*",
  cors({
    origin: env.ALLOWED_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.all("/trpc/*", (c) =>
  fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => createContext(c.req.raw),
  }),
);

serve({ fetch: app.fetch, port: 3001 }, (info) => {
  console.log(`Server running on http://localhost:${info.port}`);
});
