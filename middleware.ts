// Edge middleware: rate limiting for the API surface ONLY.
//
// Deliberately minimal, and deliberately not a security wall:
//  - No authentication. This app's sign-in is a simulated localStorage flag, so
//    any real auth check here would lock every user out of the product.
//  - No blocking and no redirects. The ONLY response this middleware ever
//    produces on its own is a 429. Anything else passes straight through.
//  - No security headers; those are configured in next.config.mjs.
//  - No Node built-ins — this runs on the Edge runtime.
//
// If the limiter itself ever throws, we fail OPEN and let the request through
// rather than 500ing the product.

import { NextResponse, type NextRequest } from "next/server";
import { rateLimit, clientKey } from "./lib/rateLimit";

// A leak test is roughly a dozen LLM calls and is slow, so the endpoints that
// trigger runs get a small budget over a long window; cheap endpoints get more.
//
// Set WARRANT_RATE_LIMIT=off to disable this entirely (single-user local or
// demo use), or set it to a number to override the run budget, e.g. "200".
const MINUTE = 60_000;
const LIMIT_OVERRIDE = process.env.WARRANT_RATE_LIMIT?.trim().toLowerCase();

const BUDGETS: ReadonlyArray<{ path: string; limit: number; windowMs: number }> = [
  { path: "/api/suite", limit: 60, windowMs: 10 * MINUTE },
  { path: "/api/crash", limit: 60, windowMs: 10 * MINUTE },
  { path: "/api/receipt", limit: 120, windowMs: MINUTE },
  { path: "/api/tts", limit: 120, windowMs: MINUTE },
  { path: "/api/live", limit: 60, windowMs: MINUTE },
  { path: "/api/scenario/draft", limit: 60, windowMs: MINUTE },
];

const DEFAULT_BUDGET = { limit: 240, windowMs: MINUTE };

type Budget = { scope: string; limit: number; windowMs: number };

function budgetFor(pathname: string): Budget {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const match = BUDGETS.find((b) => b.path === normalized);
  if (match) return { scope: match.path, limit: match.limit, windowMs: match.windowMs };
  return { scope: "api", limit: DEFAULT_BUDGET.limit, windowMs: DEFAULT_BUDGET.windowMs };
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  try {
    if (LIMIT_OVERRIDE === "off") return NextResponse.next();

    const budget = budgetFor(req.nextUrl.pathname);
    const limit =
      LIMIT_OVERRIDE && /^\d+$/.test(LIMIT_OVERRIDE) && budget.limit === DEFAULT_BUDGET.limit
        ? Number(LIMIT_OVERRIDE)
        : budget.limit;
    const result = rateLimit(clientKey(req, budget.scope), limit, budget.windowMs);

    if (!result.ok) {
      return NextResponse.json(
        {
          error: "rate_limited",
          message:
            "Warrant's own request limiter stopped this call. It is not the model provider. " +
            "Set WARRANT_RATE_LIMIT=off to disable it, or restart the server to reset the window.",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSec),
            "Cache-Control": "no-store",
          },
        }
      );
    }
  } catch {
    // Fail open: a limiter bug must never take the product down.
  }
  return NextResponse.next();
}

export const config = { matcher: ["/api/:path*"] };
