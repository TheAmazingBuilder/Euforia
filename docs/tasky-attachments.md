# Tasky card attachments

Tasky stores attachments separately from the personal board JSON snapshot.

## Contract and storage

- API routes are authenticated and scoped to the current user.
- A card must exist on that user's saved Tasky board before its attachments can be listed, uploaded, downloaded or removed.
- PostgreSQL stores file metadata and a checksum. File bytes are written atomically to the private directory configured by `TASKY_ATTACHMENTS_STORAGE_ROOT`.
- The storage root must be on a persistent volume for deployments. It is not a public web directory and should be included in the application's backup/retention plan.
- The default per-file limit is 5 MiB, with a maximum of 20 files per card.

Supported formats are PNG, JPG/JPEG, WebP, PDF, TXT, CSV and Markdown. The API checks the extension, declared MIME type, encoded payload, file signatures for binary formats, UTF-8 validity for text, and the SHA-256 checksum again when reading a file. This is a format/content sanity check, not malware scanning; only accept files from trusted users and add malware scanning if the deployment's threat model requires it.

## API

- `GET /tasky/cards/:cardId/attachments` — list attachment metadata.
- `POST /tasky/cards/:cardId/attachments` — upload a JSON payload with `fileName`, `mimeType` and base64 `contentBase64`.
- `GET /tasky/cards/:cardId/attachments/:attachmentId/download` — retrieve the owner-scoped file payload.
- `DELETE /tasky/cards/:cardId/attachments/:attachmentId` — remove metadata and best-effort delete the stored file.

When a card is removed from the saved board, the API attempts to delete its attachment metadata and stored files. If storage cleanup fails after the board write, the board save stays successful and the API logs a warning; operators should monitor the configured storage volume and include it in backups/retention procedures.

Apply the Prisma migration with the existing API database-migration procedure before testing the feature against a local database.
