import { getAuth } from "@repo/api";
import { headers } from "next/headers";
import { cache } from "react";

export const getSession = cache(async () => {
  return getAuth().api.getSession({ headers: await headers() });
});
