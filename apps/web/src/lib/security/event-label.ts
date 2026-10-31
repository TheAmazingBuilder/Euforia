type EventLabelMetadata = Readonly<
  Record<string, { readonly label: string } | undefined>
>;

/**
 * Resolve an audit-event label without trusting the runtime API payload.
 * TypeScript response generics do not validate JSON received over HTTP, so
 * older or malformed events must not be able to break the audit trail.
 */
export function getSecurityEventLabel(
  type: unknown,
  metadata: EventLabelMetadata,
): string {
  const eventType =
    typeof type === "string" && type.trim().length > 0
      ? type.trim()
      : "UNKNOWN_EVENT";

  return (
    metadata[eventType]?.label ??
    eventType
      .toLowerCase()
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (character) => character.toUpperCase())
  );
}
