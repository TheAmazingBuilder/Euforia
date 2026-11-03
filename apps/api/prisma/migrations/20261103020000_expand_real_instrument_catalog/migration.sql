-- Extend the journal's canonical catalog with genuine, broker-known
-- instruments already defined in InstrumentSpecification. Unsupported live
-- market feeds remain unavailable in Oryon until a provider is connected.
INSERT INTO "Instrument" ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "digits", "contractSize", "isActive") VALUES
  ('a04b8d9f-4cdb-4e9a-af80-9d5c2b7e1008', 'USDJPY', 'US Dollar / Japanese Yen', 'FOREX', 'JPY', '0.01', 3, '100000', true),
  ('c26d0f1b-6eef-4a1c-8ba2-bf7e4d9a1010', 'US30', 'Dow Jones 30', 'INDEX', 'USD', '1', 1, '1', true),
  ('d37e102c-7ff0-4b2d-9cb3-c08f5eab1011', 'NAS100', 'Nasdaq 100', 'INDEX', 'USD', '1', 1, '1', true)
ON CONFLICT ("symbol") DO NOTHING;

INSERT INTO "InstrumentSpecification"
  ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "contractSize", "minVolume", "maxVolume", "volumeStep", "digits", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'USDJPY', 'US Dollar / Japanese Yen', 'FOREX', 'JPY', 0.01, 100000, 0.01, 100, 0.01, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'US30', 'Dow Jones 30', 'INDEX', 'USD', 1, 1, 0.1, 100, 0.1, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NAS100', 'Nasdaq 100', 'INDEX', 'USD', 1, 1, 0.1, 100, 0.1, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("symbol") DO NOTHING;
