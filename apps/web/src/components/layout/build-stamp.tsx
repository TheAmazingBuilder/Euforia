import { execSync } from "node:child_process";

/**
 * Build stamp (preview trust aid): a whisper-quiet fixed chip that shows
 * WHICH artifact the browser is looking at — git short hash + build time.
 * Purpose: after a sandbox restart the user must be able to tell "am I
 * seeing the current build or a stale link/cache?" at a glance, without
 * opening devtools. Server component: git is read ONCE per render — in the
 * production build the value bakes into the static RSC payload; in dev it
 * re-reads per request (negligible cost).
 */
function readStamp(): string {
  try {
    const hash = execSync("git rev-parse --short HEAD", { cwd: process.cwd(), encoding: "utf8" }).trim();
    const time = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" });
    return `build ${hash} · ${time} UTC`;
  } catch {
    return "build dev";
  }
}

export function BuildStamp() {
  const stamp = readStamp();
  return (
    <div
      aria-hidden
      data-testid="build-stamp"
      className="pointer-events-none fixed bottom-1 left-1 z-50 hidden select-none font-mono text-[9px] uppercase tracking-widest text-muted-foreground/45 sm:block"
    >
      {stamp}
    </div>
  );
}
