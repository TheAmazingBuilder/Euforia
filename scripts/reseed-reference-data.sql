-- Reference-data re-seed after fresh db push (baseline skipped migration INSERTs).
-- Idempotent (ON CONFLICT / WHERE NOT EXISTS on natural unique keys).
-- Sources:
--   prisma/migrations/20261003141559_trade_planning  → InstrumentSpecification
--   prisma/migrations/20261004120000_trade_journal_core → Instrument
--   (20261004100000_settings_preferences backfill is a no-op on a fresh DB)

-- ── InstrumentSpecification catalog (unique: symbol) ──────────────────────────
INSERT INTO "InstrumentSpecification"
  ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "contractSize", "minVolume", "maxVolume", "volumeStep", "digits", "isActive", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'EURUSD', 'Euro / US Dollar',        'FOREX',    'USD', 0.0001, 100000, 0.01, 100, 0.01, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'GBPUSD', 'British Pound / US Dollar','FOREX',   'USD', 0.0001, 100000, 0.01, 100, 0.01, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'USDJPY', 'US Dollar / Japanese Yen', 'FOREX',    'JPY', 0.01,   100000, 0.01, 100, 0.01, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'XAUUSD', 'Gold / US Dollar',         'METAL',    'USD', 0.1,    100,    0.01, 50,  0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'BTCUSD', 'Bitcoin / US Dollar',      'CRYPTO',   'USD', 1,      1,      0.01, 100, 0.01, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'US30',   'Dow Jones 30',             'INDEX',    'USD', 1,      1,      0.1,  100, 0.1,  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NAS100', 'Nasdaq 100',               'INDEX',    'USD', 1,      1,      0.1,  100, 0.1,  1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("symbol") DO NOTHING;

-- ── Instrument journal catalog (unique: symbol - fixed ids from migration) ────
INSERT INTO "Instrument" ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "digits", "contractSize", "isActive")
SELECT v.id, v.symbol, v.name, v.assetClass, v.quoteCurrency, v.pipSize, v.digits, v.contractSize, v.isActive
FROM (VALUES
  ('3f9a1c2e-7b64-4d2a-9f1e-2c8b5a7d1001'::uuid, 'EURUSD', 'Euro / US Dollar', 'FOREX', 'USD', 0.0001::numeric, 5, 100000::numeric, true),
  ('4a8b2d3f-8c75-4e3b-8a2f-3d9c6b8e1002'::uuid, 'GBPUSD', 'British Pound / US Dollar', 'FOREX', 'USD', 0.0001::numeric, 5, 100000::numeric, true),
  ('5b9c3e4a-9d86-4f4c-9b3a-4e0d7c9f1003'::uuid, 'XAUUSD', 'Gold / US Dollar', 'METAL', 'USD', 0.01::numeric, 2, 100::numeric, true),
  ('6c0d4f5b-0e97-4a5d-8c4b-5f1e8d0a1004'::uuid, 'BTCUSDT', 'Bitcoin / US Dollar', 'CRYPTO', 'USD', 1::numeric, 2, 1::numeric, true),
  ('7d1e5a6c-1fa8-4b6e-9d5c-6a2f9e1b1005'::uuid, 'BOOM500', 'Boom 500 Index', 'SYNTHETIC', 'USD', 0.01::numeric, 2, 1::numeric, true),
  ('8e2f6b7d-2ab9-4c7f-8e6d-7b3a0f2c1006'::uuid, 'CRASH500', 'Crash 500 Index', 'SYNTHETIC', 'USD', 0.01::numeric, 2, 1::numeric, true),
  ('9f3a7c8e-3bca-4d8a-9f7e-8c4b1a3d1007'::uuid, 'VOL75(1s)', 'Volatility 75 (1s) Index', 'SYNTHETIC', 'USD', 0.01::numeric, 2, 1::numeric, true)
) AS v(id, symbol, name, assetClass, quoteCurrency, pipSize, digits, contractSize, isActive)
WHERE NOT EXISTS (SELECT 1 FROM "Instrument" i WHERE i.symbol = v.symbol);
