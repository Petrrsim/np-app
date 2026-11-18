"use client";

import { useCallback, useState } from "react";

/**
 * `useState` remembered in localStorage (per-browser UI preferences only — never server
 * data). Reads lazily on first render, which is safe here because protected pages only
 * render on the client (AuthGate shows a spinner until the session is known). Storage
 * failures (private mode, blocked site data) silently fall back to plain state.
 */
export function useStoredState<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T) => {
      setValue(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // storage unavailable — keep the in-memory value
      }
    },
    [key]
  );

  return [value, set];
}
