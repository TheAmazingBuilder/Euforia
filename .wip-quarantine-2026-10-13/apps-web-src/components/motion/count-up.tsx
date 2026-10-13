"use client";

import * as React from "react";
import { animate, useReducedMotion } from "motion/react";

/**
 * Count-up for mono KPI values (design refonte: "numbers feel alive").
 *
 * - Parses the FIRST numeric core out of an already-formatted string
 *   ("+285,02 $US", "42,0 %", "1,11", "+0.06R") and animates only that core;
 *   prefix (sign/currency hints) and suffix ride along untouched.
 * - Zero React re-renders: the animated text is written to a ref'd <span>
 *   inside useLayoutEffect (before paint → no first-frame flash), so this is
 *   SSR/hydration-safe and keeps `tabular-nums` stable.
 * - `prefers-reduced-motion` → renders the target value directly.
 */

const NUMERIC_CORE = /^([^0-9]*)([\d\u00a0\u202f\s.,]+)(.*)$/;

interface ParsedValue {
  prefix: string;
  core: string;
  suffix: string;
  target: number;
  decimals: number;
}

function parseValue(value: string): ParsedValue | null {
  const match = NUMERIC_CORE.exec(value);
  if (!match) return null;
  const [, prefix = "", rawCore = "", suffix = ""] = match;
  const core = rawCore.trim();
  if (core === "" || !/\d/.test(core)) return null;

  // Decimal separator = the LAST of [.,] present (fr-FR: comma; tolerate dot).
  const lastComma = core.lastIndexOf(",");
  const lastDot = core.lastIndexOf(".");
  const decIndex = Math.max(lastComma, lastDot);
  const decimals = decIndex === -1 ? 0 : core.length - decIndex - 1;
  if (!/^\d*$/.test(core.slice(decIndex + 1))) return null;

  const cleaned = core.replace(/[\u00a0\u202f\s]/g, "");
  const normalized =
    decIndex === -1
      ? cleaned
      : cleaned.slice(0, cleaned.length - decimals) +
        "." +
        cleaned.slice(cleaned.length - decimals);
  const target = Number(normalized);
  if (!Number.isFinite(target)) return null;

  return { prefix, core, suffix, target, decimals };
}

export function CountUp({
  value,
  className,
  duration = 0.7,
}: {
  value: string;
  className?: string;
  duration?: number;
}) {
  const ref = React.useRef<HTMLSpanElement | null>(null);
  const reduceMotion = useReducedMotion();
  const parsed = React.useMemo(() => parseValue(value), [value]);

  React.useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !parsed || reduceMotion) return;

    const formatter = new Intl.NumberFormat("fr-FR", {
      minimumFractionDigits: parsed.decimals,
      maximumFractionDigits: parsed.decimals,
    });
    const render = (current: number) => {
      node.textContent = `${parsed.prefix}${formatter.format(current)}${parsed.suffix}`;
    };

    render(0);
    const controls = animate(0, parsed.target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: render,
    });
    return () => controls.stop();
    // Re-run when the TARGET VALUE changes (not on every re-render).
  }, [parsed, reduceMotion, duration]);

  // Unparseable values ("-") or reduced motion: static text.
  return (
    <span ref={ref} className={className}>
      {value}
    </span>
  );
}
