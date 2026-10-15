//+------------------------------------------------------------------+
//|                                             EuforiaBridge.mq5    |
//|         Euforia trading journal — MT5 terminal bridge (v1.0.1)   |
//|                                                                  |
//| WHAT IT DOES                                                     |
//|   Reads the account attached to THIS terminal (account info,     |
//|   balance/equity snapshot, open positions, pending orders and    |
//|   incremental deal history) and pushes signed events to your     |
//|   Euforia API every InpPushSeconds. READ-ONLY: it never sends    |
//|   a trade verb. Your broker credentials NEVER leave this         |
//|   terminal — Euforia only ever receives the data you see here.   |
//|                                                                  |
//| SETUP (full guide: docs/bridge/README.md)                        |
//|   1. In Euforia: Accounts > Connect > "MT5 Terminal Bridge"      |
//|      -> copy the Ingest URL, the Bridge key and the secret.      |
//|   2. Attach this EA to ANY chart of the target account.          |
//|   3. Inputs: InpEndpointURL (absolute ingest URL),               |
//|      InpBridgeKey + InpBridgeSecret from the pairing sheet.      |
//|   4. Terminal > Options > Expert Advisors > tick                 |
//|      "Allow WebRequest for listed URL" and add your Euforia      |
//|      host. (Mandatory — MT5 blocks WebRequest otherwise.)        |
//|   5. Keep the terminal open: data is as fresh as the last push.  |
//+------------------------------------------------------------------+
#property copyright "Euforia / Cosmoz"
#property version   "1.01"
#property strict

//--- inputs
input string InpEndpointURL   = "https://localhost:3000/api/v1/trading-accounts/bridge/ingest"; // Ingest URL (pairing sheet)
input string InpBridgeKey     = "";     // X-Bridge-Key (public routing key)
input string InpBridgeSecret  = "";     // Bridge secret (pairing sheet)
input int    InpPushSeconds   = 30;     // Push cadence (seconds, 5-3600)
input int    InpDealsDaysBack = 90;     // Initial history depth (days)

//--- state
datetime g_dealsFrom        = 0;
int      g_pushCount        = 0;
int      g_failCount        = 0;
string   g_lastError        = "";
string   g_lastPushAt       = "-";
string   g_historyStartIso  = "";

//+------------------------------------------------------------------+
//| ISO-8601 UTC from datetime                                       |
//+------------------------------------------------------------------+
string IsoUtc(const datetime when)
  {
   MqlDateTime tm;
   TimeToStruct(when, tm);
   return StringFormat("%04d-%02d-%02dT%02d:%02d:%02dZ",
                       tm.year, tm.mon, tm.day, tm.hour, tm.min, tm.sec);
  }

//+------------------------------------------------------------------+
//| JSON string escape                                               |
//+------------------------------------------------------------------+
string JsonEscape(const string value)
  {
   string out = value;
   StringReplace(out, "\\", "\\\\");
   StringReplace(out, "\"", "\\\"");
   StringReplace(out, "\n", "\\n");
   StringReplace(out, "\r", "\\r");
   StringReplace(out, "\t", "\\t");
   return out;
  }

string JStr(const string value) { return "\"" + JsonEscape(value) + "\""; }
// All DECIMALS travel as strings — keeps the signed serialization byte-stable
// between MQL5 and the server re-serialization (bridge contract).
string JDec(const double value) { return "\"" + DoubleToString(value, 5) + "\""; }

//+------------------------------------------------------------------+
//| Pseudo-UUID event id (uniqueness per push; no crypto needed)     |
//+------------------------------------------------------------------+
string MakeEventId()
  {
   static long counter = 0;
   counter += 1;
   return StringFormat("ea-%I64d-%I64u-%d",
                       AccountInfoInteger(ACCOUNT_LOGIN),
                       GetTickCount64(),
                       counter);
  }

//+------------------------------------------------------------------+
//| SHA-256 of a byte array (CryptEncode wrapper)                    |
//+------------------------------------------------------------------+
bool Sha256(const uchar &data[], uchar &digest[])
  {
   uchar unusedKey[];
   ArrayResize(unusedKey, 0);
   uchar dst[];
   int size = CryptEncode(CRYPT_HASH_SHA256, data, unusedKey, dst);
   if(size <= 0) return false;
   ArrayResize(digest, size);
   ArrayCopy(digest, dst);
   return true;
  }

//+------------------------------------------------------------------+
//| HMAC-SHA256 (RFC 2104) string key/message -> lowercase hex       |
//| H((K ^ opad) || H((K ^ ipad) || m))                              |
//+------------------------------------------------------------------+
string HmacSha256Hex(const string key, const string message)
  {
   uchar keyBytes[];
   int keyLen = StringToCharArray(key, keyBytes, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if(keyLen < 0) keyLen = 0;

   uchar block[];
   ArrayResize(block, 64);
   ArrayInitialize(block, 0);
   if(keyLen > 64)
     {
      uchar keyOnly[];
      ArrayResize(keyOnly, keyLen);
      if(keyLen > 0) ArrayCopy(keyOnly, keyBytes, 0, 0, keyLen);
      uchar hashed[];
      if(!Sha256(keyOnly, hashed)) return "";
      ArrayCopy(block, hashed, 0, 0, 32);
     }
   else if(keyLen > 0)
     {
      ArrayCopy(block, keyBytes, 0, 0, keyLen);
     }

   uchar ipad[], opad[];
   ArrayResize(ipad, 64);
   ArrayResize(opad, 64);
   for(int i = 0; i < 64; i++)
     {
      ipad[i] = (uchar)(block[i] ^ 0x36);
      opad[i] = (uchar)(block[i] ^ 0x5c);
     }

   uchar msgBytes[];
   int msgLen = StringToCharArray(message, msgBytes, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if(msgLen < 0) msgLen = 0;
   ArrayResize(msgBytes, msgLen);

   uchar innerInput[];
   ArrayResize(innerInput, 64 + msgLen);
   ArrayCopy(innerInput, ipad, 0, 0, 64);
   if(msgLen > 0) ArrayCopy(innerInput, msgBytes, 64, 0, msgLen);

   uchar innerHash[];
   if(!Sha256(innerInput, innerHash)) return "";

   uchar outerInput[];
   ArrayResize(outerInput, 64 + 32);
   ArrayCopy(outerInput, opad, 0, 0, 64);
   ArrayCopy(outerInput, innerHash, 64, 0, 32);

   uchar outerHash[];
   if(!Sha256(outerInput, outerHash)) return "";

   string hex = "";
   for(int i = 0; i < 32; i++)
      hex += StringFormat("%02x", outerHash[i]);
   return hex;
  }

//+------------------------------------------------------------------+
//| Signed push: one event (kind + payload JSON) to the ingest       |
//+------------------------------------------------------------------+
bool PushEvent(const string kind, const string payloadJson)
  {
   string eventId = MakeEventId();
   long   ts      = ((long)TimeGMT()) * 1000; // MILLISECOND epoch — the ingest freshness window is ±5 min of ms (v1.0.0 sent seconds; the server tolerates both, ms is canonical).

   // Canonical serialization — MUST match the server byte-for-byte:
   //   `${timestampMs}.${JSON.stringify({eventId, kind, payload})}`
   // Key order matters: eventId, kind, payload. No whitespace.
   string envelope  = "{\"eventId\":" + JStr(eventId) +
                      ",\"kind\":" + JStr(kind) +
                      ",\"payload\":" + payloadJson + "}";
   string canonical = IntegerToString(ts) + "." + envelope;
   string signature = HmacSha256Hex(InpBridgeSecret, canonical);
   if(StringLen(signature) != 64)
     {
      g_lastError = "hmac failed";
      g_failCount += 1;
      return false;
     }

   string headers = "content-type: application/json\r\n"
                    "x-bridge-key: "       + InpBridgeKey + "\r\n"
                    "x-bridge-timestamp: " + IntegerToString(ts) + "\r\n"
                    "x-bridge-signature: " + signature + "\r\n"
                    "x-bridge-event-id: "  + eventId + "\r\n";

   uchar body[];
   int bodyLen = StringToCharArray(envelope, body, 0, WHOLE_ARRAY, CP_UTF8) - 1;
   if(bodyLen < 0) bodyLen = 0;
   ArrayResize(body, bodyLen);

   char   result[];
   string resultHeaders;
   ResetLastError();
   int status = WebRequest("POST", InpEndpointURL, headers, 10000, body, result, resultHeaders);
   if(status == -1)
     {
      g_lastError = "WebRequest error " + IntegerToString(GetLastError()) +
                    " (whitelist the URL in Terminal > Options > Expert Advisors)";
      g_failCount += 1;
      return false;
     }
   if(status != 200)
     {
      string resp = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
      if(StringLen(resp) > 120) resp = StringSubstr(resp, 0, 120) + "...";
      g_lastError = "HTTP " + IntegerToString(status) + " " + resp;
      g_failCount += 1;
      return false;
     }
   g_pushCount += 1;
   g_lastPushAt = IsoUtc(TimeGMT());
   g_lastError  = "";
   return true;
  }

//+------------------------------------------------------------------+
//| ACCOUNT_INFO — terminal-reported identity + journal anchor facts |
//+------------------------------------------------------------------+
bool PushAccountInfo()
  {
   bool isDemo = (AccountInfoInteger(ACCOUNT_TRADE_MODE) == ACCOUNT_TRADE_MODE_DEMO);
   string payload = "{\"externalAccountId\":" + JStr(IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))) +
                    ",\"currency\":"          + JStr(AccountInfoString(ACCOUNT_CURRENCY)) +
                    ",\"leverage\":"          + JStr(IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE))) +
                    ",\"server\":"            + JStr(AccountInfoString(ACCOUNT_SERVER)) +
                    ",\"brokerName\":"        + JStr(AccountInfoString(ACCOUNT_COMPANY)) +
                    ",\"accountClass\":"      + (isDemo ? JStr("DEMO") : "null") +
                    "}";
   return PushEvent("ACCOUNT_INFO", payload);
  }

//+------------------------------------------------------------------+
//| SNAPSHOT — balance/equity/margin                                 |
//+------------------------------------------------------------------+
bool PushSnapshot()
  {
   string payload = "{\"balance\":"     + JDec(AccountInfoDouble(ACCOUNT_BALANCE)) +
                    ",\"equity\":"      + JDec(AccountInfoDouble(ACCOUNT_EQUITY)) +
                    ",\"margin\":"      + JDec(AccountInfoDouble(ACCOUNT_MARGIN)) +
                    ",\"freeMargin\":"  + JDec(AccountInfoDouble(ACCOUNT_MARGIN_FREE)) +
                    ",\"marginLevel\":" + JDec(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL)) +
                    "}";
   return PushEvent("SNAPSHOT", payload);
  }

//+------------------------------------------------------------------+
//| POSITIONS — the COMPLETE open set each cycle                     |
//+------------------------------------------------------------------+
bool PushPositions()
  {
   string items = "";
   int total = PositionsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;
      string side = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "BUY" : "SELL";
      string item = "{" +
        "\"externalPositionId\":" + JStr(IntegerToString((long)ticket)) +
        ",\"symbol\":"      + JStr(PositionGetString(POSITION_SYMBOL)) +
        ",\"side\":"        + JStr(side) +
        ",\"volume\":"      + JDec(PositionGetDouble(POSITION_VOLUME)) +
        ",\"entryPrice\":"  + JDec(PositionGetDouble(POSITION_PRICE_OPEN)) +
        ",\"currentPrice\":" + JDec(PositionGetDouble(POSITION_PRICE_CURRENT)) +
        ",\"stopLoss\":"    + JDec(PositionGetDouble(POSITION_SL)) +
        ",\"takeProfit\":"  + JDec(PositionGetDouble(POSITION_TP)) +
        ",\"profit\":"      + JDec(PositionGetDouble(POSITION_PROFIT)) +
        ",\"swap\":"        + JDec(PositionGetDouble(POSITION_SWAP)) +
        // MT5 netting: commission lives on deals; positions carry none.
        ",\"commission\":null" +
        ",\"openedAt\":"    + JStr(IsoUtc((datetime)PositionGetInteger(POSITION_TIME))) +
        "}";
      if(items != "") items += ",";
      items += item;
     }
   return PushEvent("POSITIONS", "{\"positions\":[" + items + "]}");
  }

//+------------------------------------------------------------------+
//| ORDERS — the COMPLETE pending set each cycle                     |
//+------------------------------------------------------------------+
string StripPrefix(const string enumName, const string prefix)
  {
   string out = enumName;
   StringReplace(out, prefix, "");
   return out;
  }

bool PushOrders()
  {
   string items = "";
   int total = OrdersTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = OrderGetTicket(i);
      if(ticket == 0) continue;
      string type = StripPrefix(EnumToString((ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE)), "ORDER_TYPE_");
      string state = StripPrefix(EnumToString((ENUM_ORDER_STATE)OrderGetInteger(ORDER_STATE)), "ORDER_STATE_");
      string item = "{" +
        "\"externalOrderId\":" + JStr(IntegerToString((long)ticket)) +
        ",\"symbol\":"  + JStr(OrderGetString(ORDER_SYMBOL)) +
        ",\"type\":"    + JStr(type) +
        ",\"volume\":"  + JDec(OrderGetDouble(ORDER_VOLUME_CURRENT)) +
        ",\"price\":"   + JDec(OrderGetDouble(ORDER_PRICE_OPEN)) +
        ",\"stopLoss\":"   + JDec(OrderGetDouble(ORDER_SL)) +
        ",\"takeProfit\":" + JDec(OrderGetDouble(ORDER_TP)) +
        ",\"status\":"  + JStr(state) +
        ",\"createdAt\":" + JStr(IsoUtc((datetime)OrderGetInteger(ORDER_TIME_SETUP))) +
        ",\"updatedAt\":null" +
        "}";
      if(items != "") items += ",";
      items += item;
     }
   return PushEvent("ORDERS", "{\"orders\":[" + items + "]}");
  }

//+------------------------------------------------------------------+
//| DEALS — incremental since the checkpoint (HistorySelect window)  |
//| The EA owns its checkpoint (GlobalVariable, survives restarts).  |
//+------------------------------------------------------------------+
bool PushDeals()
  {
   datetime from = g_dealsFrom;
   if(from == 0)
      from = TimeGMT() - InpDealsDaysBack * 86400;

   if(!HistorySelect(from, TimeGMT() + 60))
     {
      g_lastError = "HistorySelect failed";
      g_failCount += 1;
      return false;
     }

   string items = "";
   datetime maxDealTime = from;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;

      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      // Entry/exit legs only — balance & credit operations are not trades.
      if(entry != DEAL_ENTRY_IN && entry != DEAL_ENTRY_OUT &&
         entry != DEAL_ENTRY_INOUT && entry != DEAL_ENTRY_OUT_BY)
         continue;

      string symbol = HistoryDealGetString(ticket, DEAL_SYMBOL);
      ENUM_DEAL_TYPE dtype = (ENUM_DEAL_TYPE)HistoryDealGetInteger(ticket, DEAL_TYPE);
      string side = (dtype == DEAL_TYPE_SELL) ? "SELL" : "BUY";
      datetime dt = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
      if(dt > maxDealTime) maxDealTime = dt;

      long positionId = HistoryDealGetInteger(ticket, DEAL_POSITION_ID);
      string item = "{" +
        "\"externalDealId\":" + JStr(IntegerToString((long)ticket)) +
        ",\"symbol\":" + (symbol == "" ? "null" : JStr(symbol)) +
        ",\"side\":"   + JStr(side) +
        ",\"volume\":" + JDec(HistoryDealGetDouble(ticket, DEAL_VOLUME)) +
        ",\"price\":"  + (symbol == "" ? "null" : JDec(HistoryDealGetDouble(ticket, DEAL_PRICE))) +
        ",\"profit\":" + JDec(HistoryDealGetDouble(ticket, DEAL_PROFIT)) +
        ",\"commission\":" + JDec(HistoryDealGetDouble(ticket, DEAL_COMMISSION)) +
        ",\"swap\":"   + JDec(HistoryDealGetDouble(ticket, DEAL_SWAP)) +
        ",\"positionId\":" + (positionId > 0 ? JStr(IntegerToString(positionId)) : "null") +
        ",\"executedAt\":" + JStr(IsoUtc(dt)) +
        "}";
      if(items != "") items += ",";
      items += item;
     }

   // observedThrough = the newest deal time SEEN (even if filtered out).
   string payload = "{\"deals\":[" + items + "]" +
                    ",\"observedThrough\":" + JStr(IntegerToString((int)maxDealTime)) +
                    ",\"complete\":true}";
   bool ok = PushEvent("DEALS", payload);
   if(ok)
     {
      // Checkpoint advance: +1 s past the newest seen deal (floor semantics).
      g_dealsFrom = maxDealTime + 1;
      GlobalVariableSet("EUFORIA_DEALS_FROM", (double)g_dealsFrom);
     }
   return ok;
  }

//+------------------------------------------------------------------+
//| On-chart status                                                  |
//+------------------------------------------------------------------+
void DrawStatus(const string state)
  {
   Comment(StringFormat(
      "Euforia Bridge v1.0.1\naccount: %I64d (%s)\nstate: %s\npushes: %d  failures: %d\nlast push: %s\nlast error: %s\nhistory from: %s",
      AccountInfoInteger(ACCOUNT_LOGIN),
      AccountInfoString(ACCOUNT_SERVER),
      state,
      g_pushCount, g_failCount,
      g_lastPushAt,
      (g_lastError == "" ? "none" : g_lastError),
      g_historyStartIso));
  }

//+------------------------------------------------------------------+
//| Expert initialization                                            |
//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(InpBridgeKey) == 0 || StringLen(InpBridgeSecret) == 0)
     {
      Alert("EuforiaBridge: fill InpBridgeKey and InpBridgeSecret from the Euforia pairing sheet.");
      return INIT_PARAMETERS_INCORRECT;
     }
   int cadence = InpPushSeconds;
   if(cadence < 5)    cadence = 5;
   if(cadence > 3600) cadence = 3600;
   g_dealsFrom = 0;
   if(GlobalVariableCheck("EUFORIA_DEALS_FROM"))
      g_dealsFrom = (datetime)GlobalVariableGet("EUFORIA_DEALS_FROM");
   g_historyStartIso = IsoUtc(TimeGMT() - InpDealsDaysBack * 86400);
   EventSetTimer(cadence);
   DrawStatus("initialized - first push on the next timer tick");
   return INIT_SUCCEEDED;
  }

void OnDeinit(const int reason)
  {
   EventKillTimer();
   Comment("");
  }

//+------------------------------------------------------------------+
//| Timer tick = one bridge cycle                                    |
//+------------------------------------------------------------------+
void OnTimer()
  {
   if(!TerminalInfoInteger(TERMINAL_CONNECTED))
     {
      DrawStatus("terminal offline - will retry");
      return;
     }
   // Order matters: the FIRST ever push must be ACCOUNT_INFO (activation +
   // broker identification happen there). Then the data events.
   bool ok = true;
   ok = PushAccountInfo() && ok;
   ok = PushSnapshot()    && ok;
   ok = PushPositions()   && ok;
   ok = PushOrders()      && ok;
   ok = PushDeals()       && ok;
   DrawStatus(ok ? "pushed" : "errors (see this status line)");
  }
//+------------------------------------------------------------------+
