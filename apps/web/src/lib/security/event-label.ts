import type { SecurityEventType } from "@cosmoz/shared";

export const EVENT_TYPE_META: Record<SecurityEventType, { readonly label: string }> = {
  LOGIN_SUCCESS: { label: "Sign-in" },
  LOGIN_FAILED: { label: "Failed sign-in" },
  LOGOUT: { label: "Sign-out" },
  PASSWORD_CHANGED: { label: "Password changed" },
  PASSWORD_RESET_REQUESTED: { label: "Password reset" },
  EMAIL_VERIFIED: { label: "Email verified" },
  TFA_ENABLED: { label: "2FA enabled" },
  TFA_DISABLED: { label: "2FA disabled" },
  TFA_CHALLENGE_FAILED: { label: "2FA challenge failed" },
  RECOVERY_CODES_REGENERATED: { label: "Recovery codes" },
  API_KEY_CREATED: { label: "API key created" },
  API_KEY_REVOKED: { label: "API key revoked" },
  INTEGRATION_CONNECTED: { label: "Integration connected" },
  INTEGRATION_DISCONNECTED: { label: "Integration disconnected" },
  SESSION_REVOKED: { label: "Session revoked" },
  SENSITIVE_SETTINGS_CHANGED: { label: "Sensitive setting" },
  REAUTH_OK: { label: "Re-auth OK" },
  REAUTH_FAILED: { label: "Re-auth failed" },
  ACCOUNT_DELETION_REQUESTED: { label: "Deletion request" },
  TRADING_ACCOUNT_CONNECTED: { label: "Trading account connected" },
  TRADING_ACCOUNT_CONNECTION_FAILED: { label: "Connection failed" },
  TRADING_ACCOUNT_DISCONNECTED: { label: "Trading account disconnected" },
  TRADING_ACCOUNT_SYNC_FAILED: { label: "Sync failed" },
  TRADING_ACCOUNT_BRIDGE_ROTATED: { label: "MT5 bridge secret rotated" },
  OCR_UPLOAD: { label: "Screenshot uploaded" },
  OCR_PROCESSING_FAILED: { label: "Screenshot processing failed" },
  OCR_RESULT_CONFIRMED: { label: "Recognition confirmed" },
  OCR_RESULT_DELETED: { label: "Recognition deleted" },
  OCR_TRADE_IMPORTED: { label: "Trade imported from screenshot" },
  OCR_TRADE_IMPORT_SKIPPED: { label: "Screenshot import skipped" },
  OCR_REPROCESSED: { label: "Screenshot reprocessed" },
  OCR_COLLECTION_CREATED: { label: "Screenshot collection created" },
  OCR_COLLECTION_DELETED: { label: "Screenshot collection deleted" },
  OCR_JOB_CREATED: { label: "Recognition job created" },
  OCR_JOB_CANCELLED: { label: "Recognition job cancelled" },
  OCR_RETENTION_SWEEP: { label: "Screenshot retention cleanup" },
  OCR_GROUP_CREATED: { label: "Screenshot group created" },
  TRADE_DRAFT_SAVED: { label: "Trade draft saved" },
  TRADE_IMPORTED: { label: "Trade imported" },
};

type EventLabelMetadata = Partial<
  Record<SecurityEventType, { readonly label: string }>
>;

/**
 * Resolve an audit-event label without trusting the runtime API payload.
 * TypeScript response generics do not validate JSON received over HTTP, so
 * older or malformed events must not be able to break the audit trail.
 */
export function getSecurityEventLabel(
  type: unknown,
  metadata: EventLabelMetadata = EVENT_TYPE_META,
): string {
  const eventType =
    typeof type === "string" && type.trim().length > 0
      ? type.trim()
      : "UNKNOWN_EVENT";

  const registeredLabel = metadata[eventType as SecurityEventType]?.label;

  return (
    registeredLabel ??
    eventType
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}
