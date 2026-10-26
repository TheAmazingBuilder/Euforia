/**
 * Contract mappers - rows → shared-schema-shaped payloads.
 * The ONLY place that translates persistence shapes into wire shapes.
 */
import type { UserRow, SessionRow } from "./identity.repository";
import type { AuthPrincipal } from "../../shared/auth/current-user.decorator";

/** UTC ISO-8601 with Z suffix (shared isoDateTimeSchema wire format). */
export function isoDateTime(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Fixed permission set per role - extensible, not an RBAC matrix (§26/§27). */
const TRADER_PERMISSIONS = [
  "trades:read",
  "trades:create",
  "trades:grade",
  "analytics:read",
  "journal:write",
  "session_live:use",
  "playbook:write",
  "settings:manage",
  "security:manage",
] as const;

export function permissionsForRole(role: string): string[] {
  // TRADER is the full product permission set; ADMIN extends it with future
  // administrative permissions (no RBAC matrix until a product need exists).
  void role;
  return [...TRADER_PERMISSIONS];
}

/** Account status union (mirrors the shared accountStatusSchema). */
export type MappedAccountStatus = "PENDING_VERIFICATION" | "ACTIVE" | "SUSPENDED" | "DEACTIVATED";

const ACCOUNT_STATUSES: readonly MappedAccountStatus[] = [
  "PENDING_VERIFICATION",
  "ACTIVE",
  "SUSPENDED",
  "DEACTIVATED",
];

/** Narrow a persisted `string` status to the shared union (fallback: PENDING). */
export function toAccountStatus(status: string): MappedAccountStatus {
  return (ACCOUNT_STATUSES as readonly string[]).includes(status)
    ? (status as MappedAccountStatus)
    : "PENDING_VERIFICATION";
}

export function toAuthUser(user: UserRow): {
  id: string;
  email: string;
  name: string;
  status: MappedAccountStatus;
  emailVerifiedAt: string | null;
  roles: string[];
  permissions: string[];
  createdAt: string;
} {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    status: toAccountStatus(user.status),
    emailVerifiedAt: user.emailVerifiedAt ? isoDateTime(user.emailVerifiedAt) : null,
    roles: [user.role],
    permissions: permissionsForRole(user.role),
    createdAt: isoDateTime(user.createdAt),
  };
}

export function toAuthSession(session: SessionRow, currentSessionId?: string): {
  id: string;
  device: string;
  browser: string;
  os: string;
  ipMasked: string;
  location: string;
  createdAt: string;
  lastActivityAt: string;
  current: boolean;
} {
  return {
    id: session.id,
    device: session.device,
    browser: session.browser,
    os: session.os,
    ipMasked: session.ipMasked,
    location: session.location,
    createdAt: isoDateTime(session.createdAt),
    lastActivityAt: isoDateTime(session.lastActivityAt),
    current: session.id === currentSessionId,
  };
}

export type { UserRow, SessionRow, AuthPrincipal };
