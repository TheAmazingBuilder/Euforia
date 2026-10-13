"use client";

import { MotionConfig } from "motion/react";

/**
 * Global motion configuration (DESIGN.md → Motion).
 * `reducedMotion="user"` honours `prefers-reduced-motion`: transform/layout
 * animations are disabled for those users while opacity feedback remains.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
