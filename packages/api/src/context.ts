import { db } from "@repo/db";
import { auth } from "./auth.js";

export async function createContext(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers });
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
