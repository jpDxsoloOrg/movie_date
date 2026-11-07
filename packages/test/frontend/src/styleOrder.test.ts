import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("stylesheet order", () => {
  it("loads the tokens before any component CSS", () => {
    const main = readFileSync(resolve(__dirname, "../../../frontend/src/main.tsx"), "utf8");
    expect(main.indexOf("styles/tokens.css")).toBeGreaterThan(-1);
    expect(main.indexOf("styles/tokens.css")).toBeLessThan(main.indexOf('"./App"'));
  });
});
