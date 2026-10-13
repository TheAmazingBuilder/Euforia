"use client";

import { motion } from "motion/react";

import type { HTMLMotionProps } from "motion/react";

type RevealProps = Omit<HTMLMotionProps<"div">, "initial" | "whileInView" | "viewport"> & {
  /** Extra delay (s) for light choreography between stacked sections. */
  delay?: number;
};

/**
 * Scroll-triggered entrance (motion-recipes → whileInView, once) for
 * below-the-fold sections. MotionConfig reducedMotion="user" (app-wide)
 * turns the transform off automatically; opacity still fades so content
 * never pops in for reduced-motion users.
 */
export function Reveal({ delay = 0, children, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -60px 0px" }}
      transition={{ type: "spring", stiffness: 260, damping: 28, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
