-- Remove all persistence owned exclusively by the retired Integration Hub.
-- Historical migrations are kept immutable; this forward migration brings
-- existing databases in line with the retired application surface.
DROP TABLE IF EXISTS "IntegrationWebhookDelivery" CASCADE;
DROP TABLE IF EXISTS "IntegrationWebhookEndpoint" CASCADE;
DROP TABLE IF EXISTS "IntegrationEvent" CASCADE;
DROP TABLE IF EXISTS "IntegrationError" CASCADE;
DROP TABLE IF EXISTS "IntegrationConnection" CASCADE;
DROP TABLE IF EXISTS "IntegrationRow" CASCADE;

DROP TYPE IF EXISTS "WebhookEndpointStatus";
DROP TYPE IF EXISTS "IntegrationEventType";
DROP TYPE IF EXISTS "IntegrationErrorCode";
DROP TYPE IF EXISTS "IntegrationAuthState";
DROP TYPE IF EXISTS "IntegrationStatus";
