import { useCallback, useEffect, useRef, useState } from "react";

export function useFocusPulse(durationMs = 1300) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  const trigger = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    setVisible(false);
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      setVisible(true);
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setVisible(false);
      }, durationMs);
    });
  }, [durationMs]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return {
    focusPulseVisible: visible,
    triggerFocusPulse: trigger
  };
}
