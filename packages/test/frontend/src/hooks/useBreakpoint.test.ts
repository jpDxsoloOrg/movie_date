import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBreakpoint } from "@movie-date/frontend/hooks/useBreakpoint";
import { fakeViewport } from "../support/viewport";

afterEach(() => vi.unstubAllGlobals());

describe("useBreakpoint", () => {
  it.each([
    [390, "mobile"],
    [639, "mobile"],
    [640, "tablet"],
    [1023, "tablet"],
    [1024, "desktop"],
    [1920, "desktop"],
  ])("at %ipx is %s", (width, expected) => {
    fakeViewport(width);
    expect(renderHook(() => useBreakpoint()).result.current).toBe(expected);
  });

  it("follows the viewport", () => {
    const viewport = fakeViewport(390);
    const { result } = renderHook(() => useBreakpoint());

    act(() => viewport.resize(1280));
    expect(result.current).toBe("desktop");

    act(() => viewport.resize(800));
    expect(result.current).toBe("tablet");
  });

  it("treats a browser without matchMedia as mobile", () => {
    expect(renderHook(() => useBreakpoint()).result.current).toBe("mobile");
  });
});
