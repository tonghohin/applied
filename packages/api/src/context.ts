import { type Db, db } from "@repo/db";
import { getAuth } from "./auth";

type Session = Awaited<ReturnType<ReturnType<typeof getAuth>["api"]["getSession"]>>;

export async function createContext(req: Request): Promise<{ db: Db; session: Session }> {
  const session = await getAuth().api.getSession({ headers: req.headers });
  return { db, session };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
