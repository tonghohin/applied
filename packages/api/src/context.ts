import { type Db, db } from "@repo/db";
import { auth } from "./auth";

type Session = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function createContext(req: Request): Promise<{ db: Db; session: Session }> {
  const session = await auth.api.getSession({ headers: req.headers });
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
