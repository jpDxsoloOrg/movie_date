import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAsyncData } from "@movie-date/frontend/hooks/useAsyncData";

describe("useAsyncData", () => {
  it("loads, then exposes the data", async () => {
    const { result } = renderHook(() => useAsyncData(async () => "value", []));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe("value"));
    expect(result.current.loading).toBe(false);
  });

  it("exposes the error and recovers on reload", async () => {
    const load = vi.fn<() => Promise<string>>();
    load.mockRejectedValueOnce(new Error("down")).mockResolvedValue("back");
    const { result } = renderHook(() => useAsyncData(load, []));

    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));

    await act(() => result.current.reload());

    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe("back");
  });

  it("reloads when deps change and drops the slower earlier result", async () => {
    const resolvers: ((value: string) => void)[] = [];
    const { result, rerender } = renderHook(
      ({ id }: { id: number }) =>
        useAsyncData(() => new Promise<string>((resolve) => resolvers.push(resolve)), [id]),
      { initialProps: { id: 1 } },
    );

    rerender({ id: 2 });
    await act(async () => {
      resolvers[1]?.("second");
      await Promise.resolve();
    });
    await act(async () => {
      resolvers[0]?.("first");
      await Promise.resolve();
    });

    expect(result.current.data).toBe("second");
  });

  it("keeps the old data during a reload", async () => {
    const load = vi.fn<() => Promise<string>>().mockResolvedValueOnce("one");
    const { result } = renderHook(() => useAsyncData(load, []));
    await waitFor(() => expect(result.current.data).toBe("one"));

    load.mockReturnValue(new Promise(() => undefined));
    act(() => void result.current.reload());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toBe("one");
  });
});
