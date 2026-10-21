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

INSERT INTO "UserSettings" ("userId", "preferences", "createdAt", "updatedAt")
SELECT "id", "preferences", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "User" WHERE "preferences" IS NOT NULL;

INSERT INTO "Instrument" ("id", "symbol", "name", "assetClass", "quoteCurrency", "pipSize", "digits", "contractSize", "isActive") VALUES
    ('3f9a1c2e-7b64-4d2a-9f1e-2c8b5a7d1001', 'EURUSD', 'Euro / US Dollar', 'FOREX', 'USD', '0.0001', 5, '100000', true),
    ('4a8b2d3f-8c75-4e3b-8a2f-3d9c6b8e1002', 'GBPUSD', 'British Pound / US Dollar', 'FOREX', 'USD', '0.0001', 5, '100000', true),
    ('5b9c3e4a-9d86-4f4c-9b3a-4e0d7c9f1003', 'XAUUSD', 'Gold / US Dollar', 'METAL', 'USD', '0.01', 2, '100', true),
    ('6c0d4f5b-0e97-4a5d-8c4b-5f1e8d0a1004', 'BTCUSDT', 'Bitcoin / US Dollar', 'CRYPTO', 'USD', '1', 2, '1', true),
    ('7d1e5a6c-1fa8-4b6e-9d5c-6a2f9e1b1005', 'BOOM500', 'Boom 500 Index', 'SYNTHETIC', 'USD', '0.01', 2, '1', true),
    ('8e2f6b7d-2ab9-4c7f-8e6d-7b3a0f2c1006', 'CRASH500', 'Crash 500 Index', 'SYNTHETIC', 'USD', '0.01', 2, '1', true),
    ('9f3a7c8e-3bca-4d8a-9f7e-8c4b1a3d1007', 'VOL75(1s)', 'Volatility 75 (1s) Index', 'SYNTHETIC', 'USD', '0.01', 2, '1', true);

