import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const VITE_CONFIG = readFileSync(resolve(__dirname, "../../../frontend/vite.config.ts"), "utf8");

describe("service worker", () => {
  it("keeps the tutorial screenshots out of the precache", () => {
    expect(VITE_CONFIG).toMatch(/globIgnores:\s*\[\s*"\*\*\/tutorial-\*\.webp"\s*\]/);
  });

  it("caches each tutorial screenshot when it's first shown, and nothing else", () => {
    expect(VITE_CONFIG).toMatch(/runtimeCaching:/);
    expect(VITE_CONFIG).toMatch(/sameOrigin &&/);
    expect(VITE_CONFIG).toMatch(/request\.method === "GET"/);
    expect(VITE_CONFIG).toMatch(/url\.pathname\.startsWith\("\/assets\/tutorial-"\)/);
    expect(VITE_CONFIG).toMatch(/handler:\s*"CacheFirst"/);
    expect(VITE_CONFIG).toMatch(/cacheName:\s*"tutorial-images"/);
    expect(VITE_CONFIG).toMatch(/expiration:\s*\{\s*maxEntries:\s*60\s*\}/);
    // One route only: anything wider could start caching the API.
    expect(VITE_CONFIG.match(/urlPattern:/g)).toHaveLength(1);
  });
});
