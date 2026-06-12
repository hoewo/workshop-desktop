import { useCallback, useEffect, useRef, useState } from "react";

export function useKeyedCompletionFeedback<T>(durationMs: number) {
  const [completingIds, setCompletingIds] = useState<Set<T>>(() => new Set());
  const timersRef = useRef<Map<T, number>>(new Map());

  const clearCompletionFeedback = useCallback((id: T) => {
    const existingTimer = timersRef.current.get(id);
    if (existingTimer !== undefined) {
      window.clearTimeout(existingTimer);
      timersRef.current.delete(id);
    }

    setCompletingIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }, []);

  const markCompletionFeedback = useCallback(
    (id: T, onDone?: () => void) => {
      const existingTimer = timersRef.current.get(id);
      if (existingTimer !== undefined) {
        window.clearTimeout(existingTimer);
      }

      setCompletingIds((current) => {
        const next = new Set(current);
        next.add(id);
        return next;
      });

      const timer = window.setTimeout(() => {
        timersRef.current.delete(id);
        setCompletingIds((current) => {
          if (!current.has(id)) {
            return current;
          }
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        onDone?.();
      }, durationMs);
      timersRef.current.set(id, timer);
    },
    [durationMs]
  );

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        window.clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  return {
    completingIds,
    clearCompletionFeedback,
    markCompletionFeedback
  };
}

export function useSingleCompletionFeedback(durationMs: number) {
  const [completingId, setCompletingId] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearCompletionFeedback = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setCompletingId(null);
  }, []);

  const markCompletionFeedback = useCallback(
    (id: string, onDone?: () => void) => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }

      setCompletingId(id);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setCompletingId((current) => (current === id ? null : current));
        onDone?.();
      }, durationMs);
    },
    [durationMs]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    completingId,
    clearCompletionFeedback,
    markCompletionFeedback
  };
}
