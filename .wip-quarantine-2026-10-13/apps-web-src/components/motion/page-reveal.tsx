"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Page-level enter reveal (DESIGN.md → Motion).
 * One short, quiet rise per screen; children stay whatever they were
 * (Server Components safe — they are passed through, not re-rendered).
 */
export function PageReveal({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
