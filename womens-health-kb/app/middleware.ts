import { NextRequest, NextResponse } from "next/server";

// Edge-runtime password gate. Everything except the login page and its API is
// protected. The cookie holds an HMAC token that can't be forged without
// AUTH_SECRET; we recompute it here with Web Crypto and compare.
const MARKER = "whkb-ok";
const COOKIE_NAME = "whkb_auth";

async function expectedToken(): Promise<string> {
  const secret = process.env.AUTH_SECRET || "dev-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(MARKER));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Public paths.
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && cookie === (await expectedToken())) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", pathname);
  return NextResponse.redirect(url);
}

export const config = {
  // Protect everything except static assets handled above.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
