import { auth } from "@repo/api";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/runs", "/settings"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  if (isProtected || isAuth) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (isProtected && !session) {
      return NextResponse.redirect(new URL("/sign-in", request.url));
    }

    if (isAuth && session) {
      return NextResponse.redirect(new URL("/jobs", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
