import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // packages/<pkg>/src/... is tested by packages/test/<pkg>/src/...
    include: ["**/*.test.ts", "**/*.test.tsx"],
    // Testing Library only auto-cleans between tests when `afterEach` is global.
    globals: true,
    // Only the frontend needs a DOM; jsdom would just slow the node-side suites.
    environmentMatchGlobs: [["**/frontend/**", "jsdom"]],
    setupFiles: ["./setup/domStorage.ts"],
    env: { TABLE_NAME: "movie-date-test" },
  },
});
