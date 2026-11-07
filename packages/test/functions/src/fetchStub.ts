import { vi } from "vitest";

export type Route = (url: URL, init: RequestInit) => Response | Promise<Response>;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

/** Replaces global fetch. Unstub with `vi.unstubAllGlobals()`. */
export function stubFetch(route: Route) {
  const stub = vi.fn(async (input: URL, init: RequestInit) => route(new URL(input), init));
  vi.stubGlobal("fetch", stub);
  return stub;
}
