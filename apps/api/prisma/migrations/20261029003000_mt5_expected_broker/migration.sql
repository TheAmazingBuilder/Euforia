-- Persist a user's intended broker when the technical connector is shared
-- by several brands (for example, Axi and PU Prime over the MT5 terminal bridge).
-- The first accepted account-info event must verify this expectation.
ALTER TABLE "TradingConnection"
ADD COLUMN "expectedBrokerId" TEXT;
