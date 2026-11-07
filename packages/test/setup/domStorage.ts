import "@testing-library/jest-dom/vitest";

/**
 * Node 25's own `localStorage` global has no methods without
 * `--localstorage-file`, and it shadows jsdom's. An in-memory Storage works on
 * every Node version and keeps state from leaking between test files.
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>();

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value));
  }
}

if (typeof window !== "undefined") {
  const storage = new MemoryStorage();
  for (const target of [globalThis, window] as const) {
    Object.defineProperty(target, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(target, "Storage", {
      value: MemoryStorage,
      configurable: true,
      writable: true,
    });
  }
}
