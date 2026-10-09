import { getAuth } from "@repo/api";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/dashboard", "/jobs", "/runs", "/settings"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isAuth = pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up");

  if (isProtected || isAuth) {
    // getSession extends a session that's due for a refresh and returns the new cookie in
    // Set-Cookie. Server components can't set cookies, so the proxy forwards it to the browser;
    // otherwise the cookie keeps its original expiry and the user is signed out anyway.
    const { headers: authHeaders, response: session } = await getAuth().api.getSession({
      headers: await headers(),
      returnHeaders: true,
    });

    let response: NextResponse;
    if (isProtected && !session) {
      response = NextResponse.redirect(new URL("/sign-in", request.url));
    } else if (isAuth && session) {
      response = NextResponse.redirect(new URL("/jobs", request.url));
    } else {
      response = NextResponse.next();
    }

    for (const cookie of authHeaders.getSetCookie()) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\.png$).*)"],
};
