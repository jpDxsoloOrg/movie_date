import { useEffect, useState } from "react";

/** Follows `value` once it has held still for `delayMs`. */
export function useDebouncedValue<TValue>(value: TValue, delayMs: number): TValue {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}
