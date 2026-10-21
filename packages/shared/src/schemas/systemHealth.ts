import { z } from "zod";
import { isoDateTimeSchema } from "./primitives";

/**
 * SystemHealth — the cockpit's self-check (Monitoring page). Honest by
 * design: this is a demo build, so every service reports what it actually
 * is (in-browser mock, synthetic feed, read-only broker link).
 */

export const serviceStatusSchema = z.enum(["operational", "degraded", "down", "maintenance"]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const systemServiceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: serviceStatusSchema,
  /** Latency of the latest probe, milliseconds. */
  latencyMs: z.number().int().nonnegative(),
  /** 30-day uptime, percentage 0–100. */
  uptimePct: z.number().min(0).max(100),
  /** One honest line about what backs this service in the demo build. */
  detail: z.string().min(1),
});

export type SystemService = z.infer<typeof systemServiceSchema>;

export const systemIncidentSchema = z.object({
  id: z.string().min(1),
  serviceId: z.string().min(1),
  title: z.string().min(1),
  severity: z.enum(["minor", "major", "maintenance"]),
  startedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
});

export type SystemIncident = z.infer<typeof systemIncidentSchema>;

export const systemHealthSchema = z.object({
  services: z.array(systemServiceSchema).min(1),
  /** Latency samples of the API probe, oldest first (ms). */
  latencySeries: z.array(z.number().int().nonnegative()),
  /** Human label of the sampling window, e.g. "last 60 minutes". */
  windowLabel: z.string().min(1),
  incidents: z.array(systemIncidentSchema),
  checkedAt: isoDateTimeSchema,
});

export type SystemHealth = z.infer<typeof systemHealthSchema>;
