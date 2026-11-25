import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  /** Entrance delay in seconds — use index * 0.06 to stagger a grid/list. */
  delay?: number;
  distance?: number;
  duration?: number;
  className?: string;
}

/**
 * Fades + slides its children up on mount — web counterpart of the mobile
 * app's FadeInUp (NestHR/src/components/motion/FadeInUp.tsx).
 */
export function FadeIn({
  children,
  delay = 0,
  distance = 12,
  duration = 0.4,
  className,
}: FadeInProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
