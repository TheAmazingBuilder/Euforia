import { z } from "zod";

import { isoDateTimeSchema } from "./primitives";

/**
 * System integrations - the simple demo catalog behind the /integrations
 * toggle screen. Each entry states honestly what it does in a demo build:
 * simulated state, no keys, nothing leaves the browser. (The Integration
 * Hub's provider-level architecture lives in schemas/integration.ts; this
 * contract is the lightweight catalog that screen renders today.)
 */

export const systemIntegrationCategorySchema = z.enum([
  "broker",
  "data",
  "automation",
  "productivity",
]);
export type SystemIntegrationCategory = z.infer<typeof systemIntegrationCategorySchema>;

export const systemIntegrationStatusSchema = z.enum(["connected", "disconnected"]);
export type SystemIntegrationStatus = z.infer<typeof systemIntegrationStatusSchema>;

export const integrationSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: systemIntegrationCategorySchema,
  status: systemIntegrationStatusSchema,
  connectedAt: isoDateTimeSchema.nullable(),
  description: z.string().min(1),
  /** What the connection does in a demo build (honesty line). */
  detail: z.string().min(1),
});
export type Integration = z.infer<typeof integrationSchema>;

export const integrationsCatalogResponseSchema = z.object({
  integrations: z.array(integrationSchema),
});
export type IntegrationsCatalogResponse = z.infer<typeof integrationsCatalogResponseSchema>;

/** Result of toggling one integration (connect / disconnect). */
export const toggleIntegrationResponseSchema = z.object({
  id: z.string().min(1),
  status: systemIntegrationStatusSchema,
  connectedAt: isoDateTimeSchema.nullable(),
});
export type ToggleIntegrationResponse = z.infer<typeof toggleIntegrationResponseSchema>;
