import { vi } from "vitest";

interface FakeMediaList {
  matches: boolean;
  media: string;
  addEventListener: (type: "change", listener: () => void) => void;
  removeEventListener: (type: "change", listener: () => void) => void;
}

/** jsdom has no matchMedia; this one answers min-width queries and can be resized. */
export function fakeViewport(initialWidth: number): { resize: (width: number) => void; restore: () => void } {
  let width = initialWidth;
  const listeners = new Set<() => void>();

  vi.stubGlobal("matchMedia", (query: string): FakeMediaList => {
    const minWidth = Number(/min-width: (\d+)px/.exec(query)?.[1] ?? 0);
    return {
      get matches() {
        return width >= minWidth;
      },
      media: query,
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    };
  });

  return {
    resize: (nextWidth) => {
      width = nextWidth;
      for (const listener of [...listeners]) listener();
    },
    restore: () => vi.unstubAllGlobals(),
  };
}
