"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";

/**
 * Shared expand/collapse primitive ("paper unfolds on the desk").
 *
 * Animates height 0 <-> auto with the same spring-curve grammar as the
 * journal ledger rows. When the user prefers reduced motion, the block
 * renders as plain conditional CSS (no transform/height choreography at
 * all), matching the established pattern in journal-history.
 *
 * The scroll-mt for deep-link anchoring stays on the caller's element.
 */
export function Expandable({
  open,
  children,
  className,
  duration = 0.24,
}: {
  open: boolean;
  children: React.ReactNode;
  className?: string;
  /** Seconds — kept short so the ledger never feels slow. */
  duration?: number;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return open ? <div className={className}>{children}</div> : null;
  }

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="body"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration, ease: [0.16, 1, 0.3, 1] }}
          className={cn("overflow-hidden", className)}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
