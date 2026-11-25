import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "framer-motion";

interface AnimatedNumberProps {
  value: number;
  duration?: number;
  /** e.g. "₹" */
  prefix?: string;
  /** e.g. "%" */
  suffix?: string;
  className?: string;
}

/**
 * Counts up to `value` on mount / whenever it changes — same effect as the
 * mobile app's AnimatedNumber (NestHR/src/components/motion/AnimatedNumber.tsx),
 * ported to the web with framer-motion's `animate()` instead of RN's Animated API.
 */
export function AnimatedNumber({
  value,
  duration = 1,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const [display, setDisplay] = useState(reduceMotion ? value : 0);
  const prevValue = useRef(reduceMotion ? value : 0);

  useEffect(() => {
    if (reduceMotion || !Number.isFinite(value)) {
      setDisplay(value);
      prevValue.current = value;
      return;
    }
    const controls = animate(prevValue.current, value, {
      duration,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(Math.round(v)),
    });
    prevValue.current = value;
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduceMotion]);

  return (
    <span className={className}>
      {prefix}
      {Number.isFinite(value) ? display.toLocaleString() : String(value)}
      {suffix}
    </span>
  );
}
