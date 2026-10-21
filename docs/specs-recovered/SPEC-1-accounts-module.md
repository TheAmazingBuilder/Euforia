# COSMOZ — ACCOUNTS MODULE

## Premium Trading Account Connectivity & Synchronization Experience

---

# 1. MISSION

Build the **Accounts** module for Cosmoz as a premium, production-grade trading account connectivity experience.

The Accounts module is a **first-class top-level product area** in Cosmoz.

It is responsible for allowing users to:

* connect external trading accounts;
* view connected accounts;
* distinguish Demo and Live accounts;
* understand connection and synchronization status;
* view synchronized account information;
* inspect account details;
* manage provider permissions;
* reconnect or disconnect accounts;
* monitor synchronization health;
* prepare the frontend for future real-time broker synchronization;
* prepare the application for future MT5, cTrader, broker API, and other provider integrations.

This implementation is **FRONTEND ONLY**.

Do not implement the NestJS backend, Prisma models, FastAPI services, broker adapters, real broker authentication, or real trading execution at this stage.

The frontend must nevertheless be architected so that the future backend can be connected with minimal or no UI restructuring.

---

# 2. CRITICAL RULE — AUDIT BEFORE IMPLEMENTATION

Before writing or modifying code, perform a complete repository audit.

Inspect:

* existing routes;
* layouts;
* sidebar/navigation;
* dashboard;
* design system;
* UI components;
* buttons;
* dialogs;
* drawers;
* cards;
* tables;
* badges;
* forms;
* typography;
* spacing;
* icons;
* dark/light mode;
* responsive behavior;
* existing authentication;
* API client;
* service architecture;
* hooks;
* state management;
* Zod schemas;
* TypeScript types;
* existing integrations;
* existing broker-related components;
* existing account-related functionality;
* existing Settings/Integrations functionality;
* existing WebSocket abstractions;
* existing mock services;
* existing loading/error/empty states;
* existing toast/notification system.

## HARD RULE

**DO NOT IMPLEMENT WHAT ALREADY EXISTS.**

If an equivalent Accounts, Trading Accounts, Broker Connections, Integrations, account synchronization, provider selector, or related capability already exists:

* do not create a duplicate;
* reuse the existing implementation;
* extend it only where required;
* preserve existing architecture;
* avoid parallel abstractions;
* avoid duplicate components;
* avoid duplicate state management;
* avoid duplicate API clients.

If the existing implementation already satisfies a requirement, leave it intact.

Only implement genuinely missing capabilities.

---

# 3. PRODUCT POSITIONING

Accounts should feel like a serious trading infrastructure layer rather than a generic SaaS settings page.

The user should immediately understand:

> "These are my external trading accounts connected to Cosmoz."

The experience should communicate:

* reliability;
* security;
* transparency;
* synchronization;
* professional trading infrastructure;
* read-only safety;
* provider flexibility;
* clear account state.

Avoid generic SaaS aesthetics.

Do not make Accounts look like:

* a simple CRUD table;
* a billing page;
* a generic integrations marketplace;
* a basic settings form.

It should feel closer to a professional trading terminal / portfolio infrastructure interface.

---

# 4. SIDEBAR REQUIREMENT

Create **Accounts** as a standalone top-level navigation item.

It must appear:

```text
────────────────────

ACCOUNTS

────────────────────

Dashboard
```

Accounts must be:

* above Dashboard;
* visually separated from Dashboard by one subtle divider line;
* independent from System;
* independent from Integrations;
* not nested inside Settings;
* not nested inside Trading.

The sidebar label must simply be:

> **Accounts**

Do not use:

* Trading Accounts
* Connected Accounts
* Broker Accounts
* Integrations
* Connections

as the primary sidebar label.

"Accounts" is the official product terminology.

---

# 5. INFORMATION ARCHITECTURE

The Accounts module should support the following conceptual structure:

```text
Accounts
│
├── Accounts Overview
│
├── Connected Accounts
│
├── Add Account
│
├── Account Details
│
├── Connection Details
│
├── Synchronization
│
└── Permissions
```

Do not necessarily create separate navigation items for each of these.

Prefer a cohesive application experience where:

* Overview is the main Accounts page;
* Add Account is a guided flow;
* Account Details opens from an account;
* Connection and synchronization information are contextual;
* permissions are contextual.

---

# 6. PRIMARY ACCOUNTS PAGE

Recommended route:

```text
/accounts
```

Use the repository's existing routing conventions if a different structure is already established.

The main page should contain:

## Header

Title:

> Accounts

Supporting text:

> Connect and monitor your trading accounts in one place.

Primary action:

> Add Account

Optional secondary action:

> Refresh All

Do not overpopulate the header.

---

# 7. ACCOUNTS OVERVIEW

The overview should immediately communicate the state of the user's trading infrastructure.

Recommended summary cards:

### Connected Accounts

Example:

```text
3
Connected Accounts
```

### Active Connections

```text
2
Active
```

### Synchronization

```text
Live
2 accounts
```

### Attention Required

```text
1
Needs Attention
```

Only display these metrics if they provide real value.

Do not create meaningless dashboard statistics.

---

# 8. ACCOUNT LIST

Display connected accounts using premium account cards or a hybrid card/table layout.

Each account should communicate:

* broker/provider;
* platform;
* account name;
* Demo / Live;
* account number;
* server when relevant;
* currency;
* balance;
* equity;
* margin;
* free margin;
* margin level;
* leverage;
* connection status;
* synchronization status;
* last synchronization;
* permissions;
* primary/default state if supported.

Example:

```text
IC Markets
MT5

Demo
••••••5678
USD

Balance
$10,240.00

Equity
$10,180.00

Free Margin
$9,760.00

Margin
$420.00

● Live
Synced 3 seconds ago

Read-only
```

Do not expose sensitive credentials.

Never display:

* passwords;
* API secrets;
* tokens;
* private keys;
* raw credentials.

Account identifiers should be masked where appropriate.

---

# 9. DEMO VS LIVE

Demo and Live accounts must be visually and semantically distinct.

Use a clear account environment model:

```text
DEMO
LIVE
```

Do not rely only on color.

The UI must communicate the environment through:

* text;
* badge;
* iconography where appropriate;
* semantic status.

For example:

```text
IC Markets
MT5
DEMO
```

versus:

```text
IC Markets
MT5
LIVE
```

Live accounts should receive stronger contextual confirmation where actions could affect connectivity or permissions.

Never make Demo and Live visually indistinguishable.

---

# 10. PROVIDER MODEL

The frontend must be provider-agnostic.

Do not hardcode the UI around IC Markets.

The architecture must support providers such as:

```text
MT5
MT4
cTrader
Broker APIs
Exchange APIs
Future providers
```

Provider data should be represented through typed models.

Example conceptual type:

```text
TradingProvider
├── id
├── name
├── platform
├── logo
├── capabilities
└── connectionMethods
```

Do not create provider-specific UI branches throughout the application.

Prefer:

```text
Provider Configuration
        ↓
Provider Metadata
        ↓
Reusable Connection UI
```

rather than:

```text
if MT5 ...
if IC Markets ...
if Pepperstone ...
```

---

# 11. ADD ACCOUNT FLOW

The "Add Account" experience must be a guided, premium connection wizard.

Recommended flow:

```text
1. Choose Platform
        ↓
2. Choose Provider/Broker
        ↓
3. Choose Environment
        ↓
4. Connection Method
        ↓
5. Account Credentials / Authorization
        ↓
6. Permissions
        ↓
7. Test Connection
        ↓
8. Initial Synchronization
        ↓
9. Connected
```

The actual steps should adapt to provider capabilities.

Do not force every provider through an identical flow if their future authentication mechanisms differ.

---

# 12. STEP 1 — PLATFORM

Allow the user to choose the trading platform.

Example:

```text
Choose your platform

[ MetaTrader 5 ]
[ MetaTrader 4 ]
[ cTrader ]
[ Other ]
```

Only show providers that are actually supported by the current frontend contract.

Future providers may appear as:

```text
Coming Soon
```

but do not pretend that a provider is connected when no backend exists.

---

# 13. STEP 2 — PROVIDER / BROKER

Allow selection of the broker/provider.

The UI should be designed to support:

* provider search;
* provider logo;
* provider name;
* supported platforms;
* supported environments;
* connection methods;
* availability status.

Do not build a fake marketplace.

The provider selector is a connection configuration interface, not an advertising page.

---

# 14. STEP 3 — ENVIRONMENT

User chooses:

```text
Demo Account
Live Account
```

Explain the difference when useful.

Example:

> Demo accounts use virtual funds. Live accounts represent real trading capital.

Avoid unnecessary warnings.

---

# 15. STEP 4 — CONNECTION METHOD

The frontend must support future authentication mechanisms without coupling the UI to one method.

Possible connection methods:

```text
OAuth
API Key
API Secret
Read-only credentials
Platform credentials
Provider authorization
```

The exact fields must come from provider metadata/configuration.

Do not hardcode:

```text
username + password
```

as the universal model.

---

# 16. READ-ONLY FIRST

Cosmoz V1 should be designed around **read-only trading connectivity**.

Expected permissions:

```text
READ_ACCOUNT
READ_BALANCE
READ_EQUITY
READ_POSITIONS
READ_ORDERS
READ_DEALS
READ_HISTORY
```

Explicitly exclude:

```text
PLACE_ORDER
MODIFY_ORDER
CANCEL_ORDER
CLOSE_POSITION
MODIFY_SL
MODIFY_TP
```

The UI must communicate this clearly.

Example:

> Cosmoz currently uses read-only access to synchronize your trading data. It cannot place, modify, or close trades.

This is a critical trust feature.

---

# 17. PERMISSIONS UI

Create a permissions section during connection.

Example:

```text
Account Access

✓ Account information
✓ Balance & equity
✓ Open positions
✓ Orders
✓ Trading history

Execution

— Order placement
— Order modification
— Position closing
```

Do not imply unsupported permissions.

The permission model must be provider-driven.

---

# 18. SECURITY UX

Security must be visible without becoming intrusive.

Include:

* secure connection messaging;
* masked account identifiers;
* no credential exposure;
* clear access scope;
* connection status;
* revoke/disconnect action;
* confirmation for destructive actions.

For sensitive operations such as disconnecting a live account, provide a clear confirmation dialog.

Do not ask the user to paste credentials into random UI locations.

All future credentials must be sent through the secure backend.

---

# 19. CONNECTION TEST

Before declaring an account connected, show a connection validation state.

Example:

```text
Testing connection...

✓ Provider recognized
✓ Account authenticated
✓ Account information available
✓ Read-only permissions confirmed
```

Then:

```text
Connection successful
```

Never simulate a successful connection in production UI.

For the current frontend-only phase, mock this behavior explicitly.

---

# 20. INITIAL SYNCHRONIZATION

After successful connection:

```text
Connection successful
        ↓
Initial synchronization
        ↓
Account information
        ↓
Positions
        ↓
Orders
        ↓
History
        ↓
Completed
```

Show meaningful progress.

Example:

```text
Syncing your account

Account information      ✓
Open positions           ✓
Orders                   ✓
Trading history          ●
Analytics data           ○
```

Do not fake percentage progress if the future backend cannot provide meaningful progress.

---

# 21. ACCOUNT DETAIL PAGE

Recommended route:

```text
/accounts/[accountId]
```

Reuse existing routing conventions if different.

The account detail page should contain:

## Account Header

```text
IC Markets
MetaTrader 5

DEMO
••••••5678

● Connected
```

Actions:

```text
Refresh
Connection
Manage
Disconnect
```

Avoid dangerous actions being visually dominant.

---

# 22. ACCOUNT SNAPSHOT

Display:

```text
Balance
Equity
Free Margin
Margin
Margin Level
Leverage
```

Where available.

The interface must distinguish:

### Balance

Realized account value.

### Equity

Current account value including floating P&L.

### Free Margin

Available margin.

### Margin

Currently used margin.

### Margin Level

Provider-calculated margin level where available.

Do not invent values when unavailable.

Use:

```text
—
```

or an appropriate unavailable state rather than fake data.

---

# 23. OPEN POSITIONS

Provide a positions section.

Columns may include:

```text
Symbol
Direction
Volume
Entry
Current Price
SL
TP
Floating P&L
Open Time
```

Example:

```text
XAUUSD
BUY
0.10
3850.20
3861.40
3840.00
3875.00
+$112.00
10:42
```

This is strictly informational.

Do not include:

```text
Buy
Sell
Close
Modify
Cancel
```

actions.

---

# 24. ORDERS

Display pending/current orders where provider data supports them.

Potential fields:

```text
Order ID
Symbol
Type
Volume
Price
SL
TP
Status
Created At
```

Again:

**READ ONLY.**

---

# 25. TRADING HISTORY

Display synchronized historical trading activity.

Potential categories:

```text
Orders
Deals
Closed Trades
Deposits
Withdrawals
Balance Adjustments
```

Only show categories supported by the normalized backend contract.

The UI must be prepared to distinguish:

* order;
* execution/deal;
* resulting trade.

Do not collapse all provider concepts into a misleading single object.

---

# 26. SYNCHRONIZATION STATUS

Synchronization must be a first-class concept.

Possible states:

```text
LIVE
SYNCING
DELAYED
STALE
DISCONNECTED
ERROR
UNKNOWN
```

Use semantic labels.

Example:

```text
● Live
Synced 4 seconds ago
```

or:

```text
● Delayed
Last sync 2 minutes ago
```

or:

```text
⚠ Connection interrupted
Last successful sync 8 minutes ago
```

Never claim "Live" merely because the account was connected previously.

---

# 27. CONNECTION STATUS VS SYNC STATUS

These are different concepts.

Do not merge them.

### Connection status

```text
CONNECTED
CONNECTING
DISCONNECTED
ERROR
```

### Synchronization status

```text
LIVE
SYNCING
DELAYED
STALE
ERROR
```

Example:

```text
Connection
● Connected

Synchronization
⚠ Delayed
Last sync 42 seconds ago
```

This distinction is important for future production diagnostics.

---

# 28. LAST SYNCHRONIZATION

Every account should expose:

```text
Last synchronized
```

Example:

```text
Last synchronized 4 seconds ago
```

or:

```text
Last synchronized Oct 2, 2026 at 15:42
```

Prepare the UI for:

```text
lastSyncedAt
```

from the backend.

Do not rely on frontend timestamps as the source of truth.

---

# 29. AUTO REFRESH

Provide a manual:

> Refresh

action.

Future backend support should also allow:

```text
REALTIME
POLLING
MANUAL
```

Do not implement browser-only fake polling as a substitute for backend synchronization.

For the frontend phase, mock synchronization events through a service abstraction.

---

# 30. ACCOUNT MANAGEMENT

Each account should support:

```text
View
Refresh
Reconnect
Manage permissions
Rename
Set as default
Disconnect
```

Only include "Set as default" if the existing product architecture needs a default account concept.

Avoid unnecessary settings.

---

# 31. DISCONNECT FLOW

Disconnect must be explicit.

Example:

```text
Disconnect IC Markets?

Cosmoz will stop synchronizing this account.
Your historical Cosmoz data will not be automatically deleted.

[Cancel]
[Disconnect Account]
```

The exact data-retention behavior must be defined by the future backend contract.

Do not silently delete historical journal data.

---

# 32. ACCOUNT DATA VS COSMOZ DATA

This distinction must be reflected in the UX.

External provider data:

```text
Broker
Account
Positions
Orders
Deals
Balance
Equity
```

Cosmoz-generated data:

```text
Trade Reviews
Tags
Notes
Playbook Associations
Journal Metadata
Analytics
Behavioral Analysis
Nofy References
```

Disconnecting a provider should not automatically imply deleting Cosmoz-created journal information.

Design the frontend around this distinction.

---

# 33. DEFAULT ACCOUNT

Prepare the frontend for multiple connected accounts.

Example:

```text
Primary Account
IC Markets — Demo
```

Other accounts:

```text
IC Markets — Live
Pepperstone — Demo
```

The concept of a default account may later be used by:

* Dashboard;
* Session Live;
* Trade Planner;
* Analytics;
* Risk;
* Calendar;
* Trade Review.

Do not force a default account if the existing architecture does not require it.

---

# 34. MULTI-ACCOUNT SUPPORT

The architecture must assume users may connect:

```text
1 account
5 accounts
10+ accounts
```

Do not design the UI around a single account.

Avoid global singleton state such as:

```text
currentAccount
```

when a collection of accounts is required.

Use explicit account identifiers.

---

# 35. ACCOUNT SWITCHING

If appropriate, prepare for a global account selector.

Example:

```text
All Accounts
IC Markets Demo
IC Markets Live
Pepperstone Demo
```

The selector should be reusable by:

* Dashboard;
* Session Live;
* Analytics;
* Trades;
* Risk;
* Trade Review.

However, do not introduce global account state unless the existing architecture supports it cleanly.

---

# 36. DATA MODEL — FRONTEND CONTRACTS

Create strong TypeScript types.

At minimum:

```text
TradingAccount
TradingConnection
TradingProvider
TradingAccountSnapshot
TradingPosition
TradingOrder
TradingDeal
TradingTransaction
ProviderPermission
ConnectionStatus
SynchronizationStatus
AccountEnvironment
ConnectionMethod
```

Example conceptual structure:

```text
TradingAccount

id
userId
providerId
providerName
platform
accountName
accountNumberMasked
server
environment
currency
status
connectionStatus
synchronizationStatus
lastSyncedAt
createdAt
updatedAt
capabilities
permissions
```

Do not add fields merely because they sound useful.

Only create fields required by the actual frontend experience and future contract.

---

# 37. ACCOUNT SNAPSHOT MODEL

Separate account identity from mutable financial state.

Conceptually:

```text
TradingAccount
        │
        └── TradingAccountSnapshot
                ├── balance
                ├── equity
                ├── margin
                ├── freeMargin
                ├── marginLevel
                ├── leverage
                └── timestamp
```

This prevents the frontend from treating changing financial values as static account metadata.

---

# 38. SERVICE ABSTRACTION

Do not couple React components directly to mock data.

Use:

```text
Component
   ↓
Hook
   ↓
Trading Account Service
   ↓
Mock Adapter
```

Later:

```text
Component
   ↓
Hook
   ↓
Trading Account Service
   ↓
NestJS API
   ↓
Provider Adapter
```

Example conceptual methods:

```text
listAccounts()
getAccount()
connectAccount()
testConnection()
startSynchronization()
getSyncStatus()
refreshAccount()
getPositions()
getOrders()
getDeals()
disconnectAccount()
reconnectAccount()
updateAccountSettings()
```

Do not implement backend calls yet.

---

# 39. MOCK ARCHITECTURE

Create realistic mocks.

Do not use simplistic:

```text
balance: 10000
status: connected
```

for every account.

Create multiple scenarios:

### Demo Connected

```text
IC Markets
MT5
Demo
Connected
Live sync
```

### Live Connected

```text
Broker X
MT5
Live
Connected
Live sync
```

### Delayed

```text
Connected
Synchronization delayed
```

### Disconnected

```text
Connection lost
```

### Error

```text
Authentication failed
```

### Empty

```text
No accounts connected
```

### Multiple Accounts

At least 3 realistic accounts with different states.

---

# 40. MOCK SYNCHRONIZATION

The frontend should be able to simulate:

```text
CONNECTING
    ↓
CONNECTED
    ↓
SYNCING
    ↓
LIVE
```

and:

```text
LIVE
 ↓
DELAYED
 ↓
STALE
 ↓
DISCONNECTED
```

This should be implemented behind the service abstraction.

Do not embed synchronization timers directly into UI components.

---

# 41. REAL-TIME READINESS

The frontend must be ready for future WebSocket updates.

Design the state architecture so that future events can update:

```text
ACCOUNT_UPDATED
BALANCE_UPDATED
EQUITY_UPDATED
POSITION_OPENED
POSITION_UPDATED
POSITION_CLOSED
ORDER_UPDATED
DEAL_CREATED
SYNC_STATUS_CHANGED
CONNECTION_STATUS_CHANGED
```

Do not implement a fake WebSocket if the repository does not already use one.

Instead, create the appropriate abstraction/interface.

---

# 42. FUTURE BACKEND ARCHITECTURE

The frontend must anticipate:

```text
Next.js
    ↓
NestJS API
    ↓
Trading Connectivity Domain
    ↓
Provider Adapter
    ↓
MT5 / cTrader / Broker API
```

The frontend must NEVER communicate directly with:

```text
MT5
Broker API
Provider API
FastAPI
```

All future broker connectivity must go through NestJS.

---

# 43. FASTAPI BOUNDARY

Do not call FastAPI from Accounts for basic account connectivity.

FastAPI is reserved for specialized workloads such as:

* OCR;
* behavioral analytics;
* quantitative analytics;
* statistical processing;
* machine learning;
* heavy data processing.

Accounts should remain a NestJS-owned application domain.

---

# 44. SECURITY REQUIREMENTS

The frontend must follow strict security rules.

Never:

* store broker passwords in localStorage;
* store API secrets in localStorage;
* expose access tokens unnecessarily;
* expose refresh tokens;
* log credentials;
* display raw credentials;
* send credentials directly to provider APIs from the browser;
* put provider secrets into URLs;
* put secrets into analytics events.

The frontend should assume:

```text
Secrets belong to the backend.
```

---

# 45. ERROR HANDLING

Do not expose raw backend/provider errors.

Translate technical errors into useful UX messages.

Examples:

Instead of:

```text
ECONNREFUSED 172.20.10.4:443
```

display:

> We couldn't connect to your trading account. Please verify the connection details and try again.

Possible categories:

```text
AUTHENTICATION_FAILED
PROVIDER_UNAVAILABLE
INVALID_ACCOUNT
INVALID_SERVER
PERMISSION_DENIED
RATE_LIMITED
SYNC_FAILED
CONNECTION_TIMEOUT
UNKNOWN_ERROR
```

The frontend may receive normalized error codes later.

---

# 46. LOADING STATES

Create professional loading states for:

* accounts list;
* account detail;
* connection wizard;
* provider loading;
* connection test;
* synchronization;
* positions;
* orders;
* history.

Prefer skeletons for content loading.

Avoid unnecessary full-screen spinners.

---

# 47. EMPTY STATES

At minimum:

## No Accounts

```text
No trading accounts connected

Connect your first trading account to synchronize
your balance, positions, orders, and trading history.

[Add Account]
```

## No Positions

```text
No open positions
```

## No Orders

```text
No active orders
```

## No History

```text
No trading history available yet
```

Each empty state should have appropriate contextual actions.

---

# 48. RESPONSIVE DESIGN

The module must work professionally on:

* desktop;
* laptop;
* tablet;
* mobile.

Desktop may use:

```text
Account cards
+
Data tables
+
Detail panels
```

Mobile should transition intelligently to:

```text
Stacked cards
+
Scrollable tables
+
Bottom sheets / drawers
```

Do not simply shrink desktop tables.

---

# 49. ACCESSIBILITY

Implement:

* semantic HTML;
* keyboard navigation;
* visible focus states;
* accessible dialogs;
* proper labels;
* accessible form validation;
* ARIA only where necessary;
* sufficient contrast;
* screen-reader-friendly status indicators;
* non-color-only status communication.

Connection states must never depend solely on color.

---

# 50. INTERNATIONALIZATION

Prepare all user-facing text for:

```text
English
French
```

Do not hardcode large amounts of UI copy directly inside components if the existing project already has an i18n architecture.

Reuse the existing localization system.

---

# 51. DESIGN SYSTEM

Reuse the existing Cosmoz design system.

Do not introduce a second UI language.

Reuse:

* cards;
* buttons;
* badges;
* dialogs;
* drawers;
* tables;
* tabs;
* tooltips;
* inputs;
* select controls;
* skeletons;
* toast notifications.

Only create new primitives when genuinely missing.

---

# 52. PREMIUM UX DETAILS

The Accounts experience should feel polished through:

* clear information hierarchy;
* subtle status transitions;
* restrained animations;
* meaningful micro-interactions;
* clear confirmation states;
* excellent empty states;
* useful contextual help;
* precise financial formatting;
* consistent terminology;
* responsive layouts;
* excellent spacing;
* predictable interaction patterns.

Avoid:

* excessive gradients;
* excessive glassmorphism;
* decorative animation;
* unnecessary charts;
* fake activity;
* noisy dashboards.

The visual language should remain consistent with a serious professional trading platform.

---

# 53. FINANCIAL FORMATTING

Create reusable formatting utilities for:

* currency;
* percentages;
* leverage;
* margin;
* P&L;
* prices;
* volumes;
* timestamps.

Do not hardcode:

```text
USD
```

for every account.

Respect the account currency.

Use proper decimal precision.

Do not silently round financial values in a way that could misrepresent the underlying value.

---

# 54. ACCOUNT STATUS UX

Create reusable status components.

Example:

```text
ConnectionStatus
SynchronizationStatus
EnvironmentBadge
PermissionBadge
```

This prevents inconsistent status presentation across the application.

---

# 55. ACCOUNT DATA FRESHNESS

The UI must communicate data freshness.

Example:

```text
Live
Updated 2 seconds ago
```

or:

```text
Delayed
Updated 1m 32s ago
```

or:

```text
Stale
Last update 18m ago
```

The thresholds must eventually come from backend/provider capabilities rather than arbitrary frontend assumptions.

For the mock implementation, centralize them in configuration.

---

# 56. INTEGRATION WITH OTHER COSMOZ MODULES

Do not deeply couple Accounts to other modules yet.

Prepare clean account identifiers so future modules can reference them.

Future consumers:

```text
Dashboard
Session Live
Trade Planner
Trades
Trade Review
Analytics
Risk Management
Behavioral Analytics
Calendar
Playbook
Nofy
```

Example:

```text
accountId
```

should be sufficient to establish relationships later.

Do not duplicate account information inside every feature.

---

# 57. TRADE JOURNAL INTEGRATION

The future flow should support:

```text
Broker
   ↓
Deal
   ↓
Normalized Trade
   ↓
Cosmoz Trade
   ↓
Journal
```

The Accounts frontend itself should not implement automatic trade creation unless explicitly required by an existing domain contract.

Prepare the account identity and synchronization metadata only.

---

# 58. SESSION LIVE INTEGRATION

Session Live should eventually be able to select an account:

```text
Session Live

Account:
[ IC Markets — Demo ▼ ]

Balance
Equity
Margin
Positions
```

The Accounts module must therefore expose stable account IDs and normalized account state.

Do not duplicate connection logic inside Session Live.

---

# 59. ANALYTICS INTEGRATION

Analytics will eventually consume:

```text
accountId
trade data
deal data
account snapshots
```

Do not build Analytics-specific account synchronization inside Accounts.

Accounts owns connectivity.

Analytics owns analysis.

---

# 60. PLAYBOOK / RISK INTEGRATION

Future account information may support:

* account risk limits;
* risk percentage;
* exposure;
* daily drawdown;
* account-specific configuration.

Do not implement duplicate risk calculations inside Accounts.

Accounts provides account state.

Risk Engine provides risk calculations.

---

# 61. ACCOUNT EVENTS

Prepare frontend event types for future real-time synchronization.

Potential events:

```text
ACCOUNT_CONNECTED
ACCOUNT_DISCONNECTED
ACCOUNT_UPDATED
ACCOUNT_SNAPSHOT_UPDATED
POSITION_OPENED
POSITION_UPDATED
POSITION_CLOSED
ORDER_CREATED
ORDER_UPDATED
ORDER_CANCELLED
DEAL_CREATED
SYNC_STARTED
SYNC_COMPLETED
SYNC_FAILED
CONNECTION_STATUS_CHANGED
```

Do not overengineer this if the repository already has an event abstraction.

Reuse existing patterns.

---

# 62. STATE MANAGEMENT

Separate:

### Server state

* accounts;
* account snapshots;
* positions;
* orders;
* deals;
* synchronization state.

### UI state

* selected account;
* open dialogs;
* wizard step;
* filters;
* confirmation state.

Use the project's existing state management architecture.

If React Query/TanStack Query already exists, use it for server state rather than introducing another system.

---

# 63. VALIDATION

Use Zod for frontend validation where appropriate.

Examples:

```text
AccountConnectionSchema
ProviderSelectionSchema
AccountEnvironmentSchema
ConnectionSettingsSchema
```

However:

**Frontend validation is not security validation.**

The backend will remain authoritative later.

---

# 64. API CONTRACT READINESS

Do not invent a final backend API.

Before creating service interfaces:

1. inspect existing API conventions;
2. inspect existing shared schemas;
3. inspect `@cosmoz/shared`;
4. reuse naming conventions;
5. create frontend contracts that can map cleanly to the future NestJS API.

If the backend does not exist yet, use mock implementations behind the same interface.

---

# 65. FILE / FEATURE ORGANIZATION

Follow the repository's existing structure.

If no suitable structure exists, use something conceptually similar to:

```text
features/
└── accounts/
    ├── components/
    │   ├── AccountCard
    │   ├── AccountList
    │   ├── AccountHeader
    │   ├── AccountSnapshot
    │   ├── AccountPositions
    │   ├── AccountOrders
    │   ├── AccountHistory
    │   ├── ConnectionStatus
    │   ├── SyncStatus
    │   ├── ProviderSelector
    │   ├── ConnectionWizard
    │   └── DisconnectDialog
    │
    ├── hooks/
    ├── services/
    ├── types/
    ├── schemas/
    ├── utils/
    ├── constants/
    └── mocks/
```

Do not blindly create this structure if the repository already has an established feature architecture.

---

# 66. ROUTING

Create the appropriate Accounts routes according to existing conventions.

At minimum:

```text
/accounts
/accounts/[accountId]
```

The connection flow can use:

```text
/accounts/connect
```

or an appropriate modal/drawer/wizard pattern.

Do not create unnecessary routes.

---

# 67. URL STATE

Where useful, support URL-addressable state for:

* selected account;
* filters;
* tabs.

Do not overuse URL state.

The account ID should be stable and explicit.

---

# 68. TESTING

Implement meaningful tests.

## Unit tests

Test:

* account formatting;
* currency formatting;
* status mapping;
* permission mapping;
* environment mapping;
* synchronization state;
* account selectors;
* validation schemas.

## Component tests

Test:

* account card;
* empty state;
* connection wizard;
* connection errors;
* account detail;
* positions;
* orders;
* synchronization states;
* disconnect confirmation.

## Integration tests

Test:

```text
Add Account
      ↓
Connection Test
      ↓
Initial Sync
      ↓
Connected Account
      ↓
Account Detail
```

using mocks.

---

# 69. NEGATIVE SECURITY TESTS

Explicitly verify that the frontend never exposes execution functionality.

The Accounts module must not render or expose:

```text
Buy
Sell
Close
Modify
Cancel
Place Order
```

as account-management actions.

Also verify that:

* secrets are not stored in localStorage;
* mock credentials are not rendered in production components;
* sensitive values are masked;
* account identifiers are appropriately protected;
* disconnecting does not automatically delete journal data.

---

# 70. VISUAL QA

Perform a complete visual review.

Check:

* desktop;
* tablet;
* mobile;
* light mode;
* dark mode;
* empty state;
* multiple accounts;
* Demo account;
* Live account;
* connected state;
* syncing state;
* delayed state;
* stale state;
* disconnected state;
* connection error;
* connection wizard;
* account detail;
* positions;
* orders;
* history;
* dialogs.

The final UI should feel like one coherent Cosmoz product.

---

# 71. PERFORMANCE

Avoid:

* unnecessary re-renders;
* repeated formatting;
* excessive polling;
* duplicated requests;
* huge client-side state;
* unnecessary image loading.

Use:

* memoization where justified;
* efficient server-state caching;
* lazy loading where useful;
* optimized provider logos;
* efficient tables for large trading histories.

Do not prematurely optimize without evidence.

---

# 72. OBSERVABILITY READINESS

Prepare frontend service errors so future monitoring can identify:

```text
accountId
providerId
operation
errorCode
timestamp
```

Never include:

```text
password
API secret
token
credential value
```

in telemetry.

---

# 73. ANALYTICS EVENTS

If Cosmoz already has product analytics, prepare events such as:

```text
accounts_viewed
account_add_started
provider_selected
connection_test_started
connection_test_failed
connection_succeeded
initial_sync_started
initial_sync_completed
account_disconnected
account_reconnected
```

Never send:

* credentials;
* secrets;
* full account identifiers;
* unnecessary financial information;
* private trading data.

---

# 74. FUTURE BACKEND CONTRACT

Design the frontend assuming the future backend will expose concepts similar to:

```text
GET    /accounts
GET    /accounts/:id
POST   /accounts/connect
POST   /accounts/:id/test
POST   /accounts/:id/sync
GET    /accounts/:id/positions
GET    /accounts/:id/orders
GET    /accounts/:id/deals
POST   /accounts/:id/reconnect
PATCH  /accounts/:id
DELETE /accounts/:id
```

These are **conceptual contracts only**.

Do not implement or hardcode them as final APIs unless the repository already defines them.

The actual NestJS API contract must be authoritative later.

---

# 75. FUTURE PROVIDER ARCHITECTURE

The frontend should remain compatible with:

```text
Next.js
   ↓
NestJS
   ↓
Trading Connectivity
   ↓
Provider Adapter
   ├── MT5
   ├── MT4
   ├── cTrader
   ├── Broker APIs
   └── Future Providers
```

Each provider should eventually normalize into Cosmoz's domain model.

The frontend should never need to understand provider-specific backend implementation details.

---

# 76. IMPORTANT ARCHITECTURAL BOUNDARY

Do NOT build:

* MT5 integration;
* broker API integration;
* cTrader API integration;
* FastAPI integration;
* Prisma models;
* database migrations;
* real credential storage;
* OAuth implementation;
* WebSocket backend;
* polling backend;
* broker execution;
* order placement;
* trade modification.

These belong to future backend work.

The frontend should be **integration-ready**, not integration-dependent.

---

# 77. IMPLEMENTATION PRIORITIES

## P0 — Core Accounts Experience

Implement:

* sidebar Accounts entry;
* Accounts overview;
* empty state;
* account cards/list;
* Demo/Live distinction;
* account detail;
* account snapshot;
* connection status;
* synchronization status;
* Add Account wizard;
* provider selection;
* environment selection;
* permission preview;
* mock connection;
* mock initial synchronization;
* positions;
* orders;
* trading history;
* disconnect flow;
* responsive behavior;
* accessibility;
* English/French;
* service abstraction;
* TypeScript models;
* Zod schemas;
* tests.

## P1 — Advanced Connectivity UX

Implement if the existing architecture supports it cleanly:

* multiple accounts;
* account switching;
* default account;
* reconnect;
* refresh all;
* synchronization details;
* connection history;
* advanced permission display;
* richer account diagnostics;
* real-time event abstraction;
* account activity timeline.

## P2 — Future Infrastructure UX

Do not implement unless justified by the existing product roadmap:

* provider capability explorer;
* advanced connection diagnostics;
* synchronization logs;
* provider health;
* advanced account grouping;
* multi-account portfolio aggregation;
* cross-account exposure views.

---

# 78. OUT OF SCOPE

Explicitly do not implement:

* actual broker connectivity;
* MT5 login;
* MT4 login;
* cTrader authentication;
* broker credentials;
* broker API keys;
* real OAuth;
* real WebSockets;
* real synchronization engine;
* real polling;
* order execution;
* trade modification;
* position closing;
* automated trading;
* FastAPI services;
* Prisma schema;
* NestJS controllers;
* broker adapters;
* database migrations.

---

# 79. DEFINITION OF DONE

The Accounts module is considered complete for this frontend phase when:

### Navigation

* Accounts appears as a standalone top-level sidebar item.
* Accounts appears above Dashboard.
* A subtle divider separates Accounts from the rest of the main navigation.

### Accounts Overview

A user can:

* open Accounts;
* see connected accounts;
* distinguish Demo and Live;
* see connection state;
* see synchronization state;
* see account financial snapshots;
* see last synchronization time.

### Connection

A user can:

* click Add Account;
* select a platform;
* select a provider;
* select Demo or Live;
* review permissions;
* go through a realistic mock connection flow;
* see connection validation;
* see initial synchronization;
* arrive at a connected account.

### Account Management

A user can:

* open account details;
* inspect account information;
* inspect positions;
* inspect orders;
* inspect trading history;
* refresh;
* reconnect;
* disconnect;
* manage supported account settings.

### UX

The module works correctly across:

* desktop;
* tablet;
* mobile;
* light mode;
* dark mode.

### Architecture

The implementation:

* follows existing repository architecture;
* reuses existing design-system components;
* does not duplicate existing features;
* separates server state from UI state;
* uses typed models;
* uses validation;
* uses service abstractions;
* uses realistic mocks;
* is ready for NestJS integration;
* does not directly communicate with brokers;
* does not depend on FastAPI.

### Security

The implementation:

* never exposes credentials;
* never stores secrets in localStorage;
* never exposes execution controls;
* masks sensitive account identifiers;
* clearly communicates read-only access.

### Testing

The implementation contains:

* unit tests;
* component tests;
* integration tests;
* negative security tests;
* visual verification.

---

# 80. FINAL ARCHITECTURAL PRINCIPLE

The Accounts module must establish the foundation for Cosmoz's future Trading Connectivity layer.

The intended long-term architecture is:

```text
                         COSMOZ
                            │
                         Next.js
                            │
                            ▼
                       NestJS API
                            │
                 Trading Connectivity
                            │
                 Provider Adapter Layer
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
         MT5             cTrader          Broker API
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                            ▼
                    Normalized Data
                            │
                            ▼
                    Cosmoz Domain
                            │
          ┌─────────────────┼─────────────────┐
          ▼                 ▼                 ▼
      Accounts          Session Live       Trades
          │                 │                 │
          └─────────────────┼─────────────────┘
                            ▼
                       Analytics
```

The frontend being built now must represent the **user-facing contract of this architecture**, without prematurely implementing the infrastructure behind it.

The central principle is:

> **Accounts owns connectivity and account state. It does not own trading execution, analytics, risk calculations, OCR, or broker-specific business logic.**

And:

> **The broker remains the source of truth for external account state. Cosmoz consumes, normalizes, synchronizes, enriches, and presents that information.**

Finally:

> **If a capability already exists anywhere in the Cosmoz repository, reuse it. Never create a duplicate implementation simply because this prompt describes it.**
