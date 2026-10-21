# COSMOZ — PROMPT 3

## FRONTEND OCR & TRADE RECOGNITION V1

---

# 1. ROLE

You are acting as a **Senior Frontend Engineer / Frontend Architect** on **Cosmoz**, a professional Trading Journal SaaS platform.

The frontend stack is:

* Next.js
* TypeScript
* React
* Tailwind CSS
* Existing project UI components
* Existing frontend architecture
* Authentication already implemented through Prompt 1
* Session Live currently being built through Prompt 2

The target Cosmoz backend is:

```text
Next.js
    ↓
NestJS API
    ↓
PostgreSQL / Prisma
```

Cosmoz also contains a Python microservice:

```text
NestJS
    ↓
FastAPI
    ↓
OCR / Computer Vision / Trade Recognition
```

Your current task concerns **ONLY the Next.js frontend**.

---

# 2. FEATURE TO BUILD

Build the complete frontend experience for:

# OCR & Trade Recognition

This feature will eventually allow Cosmoz users to:

* import a trading screenshot;
* automatically analyze the screenshot;
* detect the trading platform;
* extract trading information;
* recognize individual fields;
* display extracted results;
* display recognition confidence;
* allow the user to correct extracted data;
* validate the information;
* transform the result into a Trade Draft;
* confirm the import into the trading journal.

The actual OCR engine will be implemented later inside the **FastAPI** microservice.

The frontend must therefore be built today as a **production-ready experience**, using realistic mocks and an abstraction layer that can later be connected to NestJS without redesigning the UI.

---

# 3. ABSOLUTE RULE

DO NOT implement the OCR engine inside Next.js.

DO NOT:

* install a Python OCR engine inside Next.js;
* use Tesseract in the browser as the final architecture;
* use an external OCR API as a mandatory dependency;
* implement Computer Vision logic inside React;
* expose FastAPI credentials to the client;
* call FastAPI directly from the browser;
* create a second backend architecture;
* bypass NestJS.

Required architecture:

```text
NEXT.JS
   │
   │ API client
   ▼
NESTJS
   │
   │ internal service communication
   ▼
FASTAPI
   │
   ▼
OCR / Vision / Recognition
```

The frontend must communicate **only with NestJS**.

---

# 4. UX OBJECTIVE

The user should feel that they are using a professional trading-import and recognition tool.

The primary workflow must be:

```text
Import Screenshot
       ↓
Preview
       ↓
Configure Recognition
       ↓
Processing
       ↓
Recognition Result
       ↓
Review & Correction
       ↓
Trade Draft
       ↓
Confirm
       ↓
Trade Imported
```

The experience must remain understandable even for a user who has never used OCR before.

---

# 5. MANDATORY REPOSITORY AUDIT

Before writing code, inspect the existing frontend repository.

Analyze at minimum:

```text
app/
components/
features/
hooks/
lib/
services/
api/
stores/
types/
schemas/
data/
public/
styles/
```

Identify:

* routing;
* main layout;
* sidebar;
* topbar;
* design system;
* UI components;
* modal/drawer components;
* toast system;
* forms;
* tables;
* cards;
* upload components;
* charts;
* loading states;
* empty states;
* error states;
* authentication provider;
* API client;
* Zustand/Context or other state management;
* React Query/TanStack Query if present;
* Zod;
* `@cosmoz/shared`;
* naming conventions;
* file conventions;
* testing conventions.

IMPORTANT:

**DO NOT create a new design system if Cosmoz already has one.**

Reuse existing components and patterns.

---

# 6. AUTHENTICATION REUSE

The authentication system implemented through Prompt 1 remains the source of truth.

The OCR feature must follow:

```text
Authenticated User
       ↓
OCR Workspace
       ↓
User-owned OCR jobs
       ↓
User-owned trade drafts
```

Never store authentication tokens directly inside OCR components.

Use the existing centralized API client.

---

# 7. FRONTEND ROUTING

Create a dedicated OCR/import section.

Recommended placement:

```text
TRADING
├── Session Live
├── Trades
├── Trade Review
├── Analytics
├── Playbook
├── Calendar
└── Import & Recognition
```

Recommended UI name:

# Import & Recognition

Recommended route:

```text
/trading/import
```

or, if the existing architecture uses a different convention:

```text
/trading/recognition
```

Inspect the existing routes first and follow the established convention.

---

# 8. FEATURE STRUCTURE

Create an isolated frontend feature:

```text
features/
└── trade-recognition/
    ├── components/
    ├── hooks/
    ├── services/
    ├── types/
    ├── schemas/
    ├── utils/
    ├── constants/
    └── mocks/
```

Adapt this structure to the repository's existing conventions.

Do not introduce a competing architecture.

---

# 9. PAGE 1 — RECOGNITION OVERVIEW

Route:

```text
/trading/import
```

Purpose:

Introduce the feature.

Content:

```text
Import & Recognition

Automatically extract trade information
from your trading screenshots.

[ Upload Screenshot ]
```

Also display, when available:

* recent imports;
* screenshots analyzed;
* successful imports;
* imports requiring review;
* recent failures.

---

# 10. HERO / EMPTY STATE

When the user has no previous imports, provide a professional empty state.

Conceptual example:

```text
┌──────────────────────────────────────────────┐
│                                              │
│        Import your trading screenshot       │
│                                              │
│  Cosmoz will automatically detect trade      │
│  information from your screenshot.           │
│                                              │
│          [ Upload Screenshot ]               │
│                                              │
│  Supports MT5 · TradingView · cTrader        │
│                                              │
└──────────────────────────────────────────────┘
```

Do not copy this exact design.

Create an interface consistent with the Cosmoz design system.

---

# 11. UPLOAD EXPERIENCE

Create a reusable component:

```text
ScreenshotUploader
```

Required functionality:

* drag & drop;
* click to upload;
* native file picker;
* image preview;
* remove;
* replace;
* validation;
* upload state;
* processing state;
* error state.

Recommended formats:

```text
PNG
JPG
JPEG
WEBP
```

Use an existing global file-size configuration if one exists.

Do not arbitrarily hardcode a size limit if the project already has centralized configuration.

---

# 12. DRAG & DROP

The uploader must support:

```text
Drag screenshot here
```

with visual states:

```text
idle
dragging
accepted
rejected
```

Feedback must be accessible and clear.

---

# 13. IMAGE PREVIEW

After selecting a screenshot:

```text
┌──────────────────────────────┐
│                              │
│       Screenshot Preview     │
│                              │
│         [ image ]            │
│                              │
└──────────────────────────────┘

filename.png
2.4 MB

[ Replace ] [ Remove ]
```

Support where appropriate:

* zoom;
* fullscreen preview;
* image dimensions;
* format;
* file size.

Do not destructively modify the original image.

---

# 14. RECOGNITION CONFIGURATION

After upload, provide:

# Recognition Settings

Possible options:

```text
Platform

○ Auto Detect
○ MetaTrader 5
○ TradingView
○ cTrader
○ Other
```

And:

```text
Recognition Mode

○ Automatic
○ Trade Details
○ Account / Position
○ Chart Analysis
```

However:

**Do not expose options that the V1 backend will not actually support.**

If an option is future functionality, display it as disabled / coming soon rather than pretending that it works.

---

# 15. RECOGNITION PROCESSING SCREEN

After starting recognition:

```text
Analyzing screenshot...

Step 1
✓ Image uploaded

Step 2
✓ Image preprocessing

Step 3
● Reading screenshot

Step 4
○ Detecting trade fields

Step 5
○ Building trade draft
```

The frontend must be architected so that real progress events can later be received from the backend.

Do not make the final architecture depend on:

```text
setTimeout()
```

for fake processing.

Mocks may simulate progress during frontend development.

---

# 16. FRONTEND JOB MODEL

Create a conceptual frontend type:

```ts
RecognitionJob
```

with information such as:

```text
id
status
progress
stage
createdAt
completedAt
error
```

Statuses:

```text
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
```

Stages:

```text
UPLOADING
PREPROCESSING
OCR
CLASSIFICATION
EXTRACTION
NORMALIZATION
COMPLETED
```

Centralize these values.

---

# 17. RESULT PAGE

Once recognition completes:

# Recognition Result

Present the result professionally.

### Screenshot

Display:

```text
Original Screenshot
```

### Extracted Data

Display:

```text
Detected Trade

Symbol       XAUUSD
Direction    BUY
Volume       0.10
Entry        2645.32
Stop Loss    2638.50
Take Profit  2660.00
P&L          +146.80
```

---

# 18. CONFIDENCE SYSTEM

Every recognized field should support a recognition confidence score.

Example:

```text
Symbol
XAUUSD
94%
```

or:

```text
Entry Price
2645.32
98%
```

or:

```text
Stop Loss
2638.50
72%
⚠ Review recommended
```

Create visual states:

```text
HIGH
MEDIUM
LOW
```

Do not present confidence as a guarantee of correctness.

Use terminology such as:

```text
Recognition confidence
```

rather than:

```text
Accuracy guaranteed
```

---

# 19. RECOGNIZABLE FIELDS

Design the frontend to support an extensible field model.

V1 may include:

```text
Platform
Symbol
Direction
Volume
Entry Price
Exit Price
Stop Loss
Take Profit
Profit/Loss
Currency
Open Time
Close Time
Position ID
Order ID
Account Balance
Account Equity
```

Not every screenshot will contain every field.

The frontend must support:

```text
FOUND
NOT_FOUND
UNCERTAIN
NOT_APPLICABLE
```

---

# 20. FIELD REVIEW COMPONENT

Create a reusable component:

```text
RecognizedField
```

Example:

```text
┌─────────────────────────────────────┐
│ Symbol                              │
│                                     │
│ XAUUSD                         97%  │
│                                     │
│ [ Edit ]                            │
└─────────────────────────────────────┘
```

For uncertain fields:

```text
┌─────────────────────────────────────┐
│ Stop Loss                           │
│                                     │
│ 2638.50                         68% │
│ ⚠ Please verify                    │
│                                     │
│ [ Edit ]                            │
└─────────────────────────────────────┘
```

---

# 21. INLINE EDITING

Allow users to edit extracted values directly.

Example:

```text
Entry Price

[ 2645.32 ]
```

All edited values must be validated.

Types should be respected:

```text
symbol → string
direction → enum
volume → decimal
price → decimal
P&L → decimal
date → datetime
```

---

# 22. VALIDATION

Use Zod if already present.

Prefer shared schemas from:

```text
@cosmoz/shared
```

if the repository already uses them for this purpose.

Do not rely only on:

```text
if (!value)
```

for financial data.

Support:

* decimal validation;
* positive volume;
* valid symbol;
* valid direction;
* valid price;
* date validation;
* SL/TP coherence;
* exit after entry;
* P&L format.

Do not duplicate backend business rules unnecessarily.

---

# 23. TRADE DRAFT

After the extracted information has been reviewed:

```text
Create Trade Draft
```

Build a:

```text
TradeDraft
```

Conceptually:

```text
RecognitionResult
       ↓
TradeDraft
       ↓
User Review
       ↓
Confirm
```

The Trade Draft must not be treated as a permanently stored Trade until confirmation.

---

# 24. TRADE DRAFT REVIEW

Create a professional review interface:

```text
Review Trade
```

Sections:

### Basic Information

* Symbol
* Direction
* Platform

### Execution

* Entry
* Exit
* Volume

### Risk Management

* Stop Loss
* Take Profit
* Risk/Reward, if calculable

### Result

* P&L
* P&L %
* Currency

### Timing

* Open time
* Close time

---

# 25. IMAGE ↔ DATA RELATION

Prepare the architecture to allow a recognized field to reference its source location.

Future structure:

```text
recognized field
       ↓
source region
       ↓
bounding box
       ↓
highlight on screenshot
```

Example:

```text
Entry Price
2645.32
98%

[ View source ]
```

When clicked:

```text
Screenshot
      ↓
highlight detected region
```

This feature may remain optional for V1, but the data model should not prevent it.

---

# 26. REVIEW WARNINGS

Create a warning system.

Examples:

```text
⚠ Low confidence on Stop Loss
⚠ Exit price was not detected
⚠ Position size could not be determined
⚠ Screenshot appears incomplete
⚠ Multiple trades may be present
```

Warnings should be associated with the relevant field or recognition result.

---

# 27. MULTIPLE TRADE DETECTION

Prepare the frontend for screenshots containing multiple trades.

Example:

```text
Detected 3 trades
```

Then:

```text
Trade #1
Trade #2
Trade #3
```

Each trade should be selectable and reviewable.

Even if V1 officially supports only one trade, do not design the types in a way that makes multiple trades impossible later.

---

# 28. CONFIRMATION

Before importing:

```text
Ready to import

XAUUSD
BUY
0.10
Entry 2645.32
Exit 2659.98
P&L +146.80

[ Back to Review ]

[ Confirm & Import ]
```

The final action must be explicit.

---

# 29. IMPORT SUCCESS

After confirmation:

```text
Trade imported successfully
```

Actions:

```text
[ View Trade ]
[ Import Another ]
```

Use the existing notification/toast system.

Do not create a second notification system.

---

# 30. IMPORT HISTORY

Create:

# Recognition History

Display:

```text
Screenshot
Platform
Detected Trades
Status
Confidence
Created
Actions
```

Example:

```text
XAUUSD_MT5.png
MT5
1 trade
Completed
94%
2 min ago
```

Statuses:

```text
Processing
Completed
Needs Review
Failed
```

---

# 31. HISTORY DETAILS

When opening an existing recognition job:

```text
Recognition Details
```

Display:

* screenshot;
* recognition status;
* detected platform;
* extracted fields;
* confidence;
* warnings;
* created date;
* processing duration;
* resulting trade;
* errors, if any.

---

# 32. ERROR UX

Support distinct error categories.

### Upload error

```text
We couldn't upload this file.
```

### Unsupported image

```text
This image format isn't supported.
```

### Recognition failure

```text
We couldn't recognize enough information from this screenshot.
```

### Partial recognition

```text
Some trade information was detected, but several fields require review.
```

### Network error

```text
Connection lost.
```

### Server error

```text
Recognition service temporarily unavailable.
```

Never expose raw internal backend errors to users.

---

# 33. EMPTY STATES

Support:

```text
No imports yet
```

```text
No completed recognitions
```

```text
No failed jobs
```

```text
No trades detected
```

Every empty state should provide a useful next action.

---

# 34. LOADING STATES

Use the project's existing loading components.

Support:

* skeletons;
* spinners;
* progress indicators;
* disabled states;
* appropriate optimistic feedback.

Avoid blank screens.

---

# 35. RESPONSIVE DESIGN

The entire feature must work on:

```text
Desktop
Tablet
Mobile
```

Desktop:

```text
Screenshot | Extracted Data
```

Mobile:

```text
Screenshot

↓

Extracted Data

↓

Review

↓

Confirmation
```

Do not simply shrink desktop UI.

Adapt the layout intentionally.

---

# 36. ACCESSIBILITY

Support:

* keyboard navigation;
* focus states;
* semantic labels;
* aria attributes;
* screen reader compatibility;
* sufficient contrast;
* accessible error announcements;
* non-drag/drop upload alternative;
* clearly named buttons.

Uploading must always be possible without drag & drop.

---

# 37. FRONTEND SECURITY

Never:

* store broker credentials;
* store FastAPI credentials;
* expose secrets;
* expose API keys;
* place sensitive tokens in localStorage if the authentication architecture protects them differently;
* trust OCR results as authoritative;
* consider extracted data validated without user confirmation.

Uploaded files must be treated as **untrusted input**.

---

# 38. PRIVACY UX

Trading screenshots may contain sensitive information.

The UI should clearly communicate:

```text
Your screenshot will be securely processed by Cosmoz.
```

Do not unnecessarily display:

* account IDs;
* broker credentials;
* private metadata.

If the system detects potentially sensitive information, prepare for:

```text
Potential sensitive information detected
```

Do not claim that all secrets can be detected.

---

# 39. API ABSTRACTION

Create a service abstraction such as:

```text
tradeRecognitionService
```

or follow the existing API-service architecture.

Conceptually support:

```text
uploadScreenshot()
createRecognitionJob()
getRecognitionJob()
getRecognitionResult()
updateTradeDraft()
confirmImport()
cancelRecognition()
listRecognitionHistory()
```

The frontend must never call FastAPI directly.

---

# 40. MOCK API

During frontend development, create realistic mocks.

Examples:

```text
mockRecognitionJob
mockRecognitionResult
mockTradeDraft
mockRecognitionHistory
```

Support:

### Success

```text
COMPLETED
```

### Partial

```text
COMPLETED + warnings
```

### Low confidence

```text
COMPLETED + low confidence
```

### Failed

```text
FAILED
```

### Processing

```text
PROCESSING
```

---

# 41. DO NOT COUPLE THE UI TO MOCKS

Components must not contain logic such as:

```text
if mock...
```

Create an abstraction:

```text
RecognitionService
```

Then provide:

```text
MockRecognitionService
```

and later:

```text
ApiRecognitionService
```

Architecture:

```text
UI
 ↓
RecognitionService
 ↓
Mock OR API
```

---

# 42. TYPES

Create strongly typed models.

Conceptually:

```text
RecognitionJob
RecognitionResult
RecognizedTrade
RecognizedField
RecognitionWarning
RecognitionConfidence
TradeDraft
RecognitionHistoryItem
```

Prefer enums/unions over arbitrary strings.

---

# 43. STATE MANAGEMENT

Do not introduce Zustand, Redux, or another global state solution simply because this feature exists.

Inspect the existing architecture first.

Use:

* local state for local UI state;
* React Query/TanStack Query if already used for server state;
* global state only when genuinely required.

Clearly separate:

```text
Server State
```

from:

```text
UI State
```

---

# 44. URL STATE

When useful, use URL state for navigable recognition context.

Examples:

```text
/trading/import?job=123
```

or:

```text
/trading/import/history/123
```

Respect existing routing conventions.

The primary context should survive a page refresh.

---

# 45. COMPONENT ARCHITECTURE

Create reusable components such as:

```text
RecognitionUploader
RecognitionPreview
RecognitionSettings
RecognitionProgress
RecognitionResult
RecognizedField
ConfidenceBadge
RecognitionWarning
TradeDraftForm
TradeDraftSummary
RecognitionHistory
RecognitionStatusBadge
RecognitionEmptyState
RecognitionErrorState
```

Do not create one massive:

```text
page.tsx
```

containing all UI and business logic.

---

# 46. DESIGN SYSTEM

Strictly follow the existing Cosmoz design system.

Reuse existing components for:

* Button
* Card
* Badge
* Dialog
* Drawer
* Input
* Select
* Tabs
* Table
* Toast
* Tooltip
* Progress
* Skeleton
* Alert

Do not introduce a new UI library without justification.

---

# 47. FINANCIAL DATA UX

Financial values must be displayed accurately.

Respect:

* decimals;
* currency;
* positive/negative sign;
* precision;
* separators;
* locale.

Do not arbitrarily transform:

```text
2645.32
```

into:

```text
2,645
```

when decimal precision is meaningful.

---

# 48. DATES

Follow Cosmoz's global date strategy.

Account for:

```text
UTC
User timezone
Locale
```

Do not scatter timezone conversions throughout components.

Centralize date formatting.

---

# 49. INTERNATIONALIZATION

Cosmoz should support multiple languages.

Do not hardcode user-facing strings inside components if the project already has an i18n system.

Prepare at minimum:

```text
English
French
```

OCR-related UI text must be translatable.

---

# 50. SESSION LIVE INTEGRATION

The module must remain compatible with Session Live.

Prepare for:

```text
Session Live
     ↓
Import Screenshot
     ↓
Recognition
     ↓
Trade Draft
     ↓
Attach to Session
```

However, do not tightly couple the OCR feature to Session Live.

The OCR module must remain independently usable.

---

# 51. TRADE JOURNAL INTEGRATION

After confirmation:

```text
Recognition
      ↓
Trade Draft
      ↓
Trades
```

Navigate to the existing Trade detail page/routes.

Do not create a second Trade implementation.

---

# 52. NOFY INTEGRATION

Prepare for:

```text
Recognition Result
      ↓
Save as Nofy Note
```

This can remain P1/P2.

Nofy must not be required for OCR functionality.

---

# 53. ANALYTICS

If Cosmoz already has an analytics system, prepare appropriate frontend events.

Conceptual events:

```text
recognition_upload_started
recognition_upload_completed
recognition_started
recognition_completed
recognition_failed
recognition_review_started
recognition_field_corrected
recognition_import_confirmed
recognition_import_cancelled
```

Never send screenshot contents or sensitive trade information through analytics.

---

# 54. PERFORMANCE

Screenshots can be large.

Handle:

* optimized preview;
* object URLs;
* object URL cleanup;
* lazy loading;
* compression only when compatible with the future pipeline;
* avoiding duplicate image copies in memory;
* avoiding unnecessary base64 encoding.

---

# 55. ABORT / CANCEL

If the recognition job supports cancellation:

```text
[ Cancel Analysis ]
```

Prepare:

```text
cancelRecognitionJob()
```

Do not merely hide the loader.

---

# 56. RETRY

For failed recognition:

```text
[ Try Again ]
```

Retry should be handled through the service layer.

Do not use:

```text
reload page
```

as the retry mechanism.

---

# 57. SECURITY & OWNERSHIP UX

The UI must never display another user's recognition jobs.

The backend remains the ultimate authorization authority.

The frontend must still correctly handle ownership information returned by the API.

---

# 58. TESTING

Create tests according to the project's existing testing stack.

Minimum coverage:

### Upload

* valid image;
* invalid format;
* oversized file;
* cancel;
* replace.

### Recognition

* processing;
* successful result;
* partial result;
* failed result;
* retry.

### Fields

* edit;
* validation;
* confidence;
* warning.

### Trade Draft

* valid draft;
* invalid draft;
* confirmation;
* cancellation.

### History

* empty;
* populated;
* pagination if supported;
* detail view.

### Security

Verify that no:

* token;
* secret;
* broker credential;
* FastAPI credential

is exposed to the client.

---

# 59. VISUAL QA

After implementation, verify:

```text
Desktop
Tablet
Mobile
```

Pay particular attention to:

* uploader;
* preview;
* processing;
* recognition result;
* review;
* confirmation;
* history;
* errors;
* empty states.

No screen should look like a prototype.

---

# 60. MOCK DATA QUALITY

Mocks must be realistic.

Create fictional examples such as:

```text
XAUUSD BUY
XAUUSD SELL
EURUSD BUY
NAS100 SELL
BTCUSD BUY
```

with different confidence levels.

Example:

```text
XAUUSD
Entry: 2645.32
SL: 2638.50
TP: 2660.00
Volume: 0.10
P&L: +146.80
Confidence: 94%
```

All mock data is fictional and intended only for frontend development.

---

# 61. ACCESSIBILITY STATES

Test:

```text
Keyboard only
Tab navigation
Enter
Escape
Screen reader labels
Focus trap in dialogs
```

Especially for:

* uploader;
* dialogs;
* image preview;
* editing;
* confirmation.

---

# 62. ERROR BOUNDARIES

Respect the existing error-boundary architecture.

A recognition failure must never crash the entire application.

---

# 63. FRONTEND OBSERVABILITY

If Cosmoz already has error tracking or logging:

use the existing system.

Do not log:

* screenshot contents;
* tokens;
* credentials;
* unnecessary sensitive trade metadata.

---

# 64. STATE DESIGN

Every major screen should support at minimum:

```text
Default
Loading
Success
Empty
Error
Disabled
Partial
```

Recognition results should additionally support:

```text
High confidence
Medium confidence
Low confidence
Missing
```

---

# 65. PRIORITIES

## P0 — REQUIRED

Build:

```text
Import & Recognition page
Upload
Preview
Recognition configuration
Processing state
Recognition result
Confidence
Field editing
Warnings
Trade Draft
Confirmation
Success
Error
History
Responsive design
Accessibility
Mocks
API abstraction
Tests
```

## P1

Prepare:

```text
Multiple trades
Source regions
Bounding boxes
Advanced filtering
Retry management
Session Live integration
Nofy integration
```

## P2

Do not implement now unless already available:

```text
AI interpretation
Chart pattern recognition
Automatic strategy identification
AI trade analysis
AI psychology analysis
Predictive analytics
```

---

# 66. EXPLICITLY OUT OF SCOPE

DO NOT build:

* Python OCR engine;
* FastAPI service;
* Computer Vision pipeline;
* ML model;
* LLM recognition;
* Prisma database models;
* NestJS OCR module;
* broker integration;
* automatic trade execution;
* automatic order placement;
* automatic SL/TP modification;
* automatic trade creation without confirmation;
* AI trading recommendations.

This task is **frontend-only and integration-ready**.

---

# 67. FINAL TARGET ARCHITECTURE

At maturity:

```text
                         COSMOZ
                           │
                    ┌──────┴──────┐
                    │             │
                 Next.js       NestJS
                    │             │
                    │       OCR Orchestrator
                    │             │
                    │             ▼
                    │          FastAPI
                    │             │
                    │       OCR / Vision
                    │             │
                    │             ▼
                    │      Recognition Result
                    │             │
                    ◄──────────────┘
                           API
```

Frontend workflow:

```text
Screenshot
    ↓
Upload
    ↓
Recognition Job
    ↓
Processing
    ↓
Recognition Result
    ↓
Review
    ↓
Trade Draft
    ↓
Confirmation
```

---

# 68. CRITICAL ARCHITECTURAL RULE

Never make:

```text
React component
```

directly depend on:

```text
FastAPI endpoint
```

Always use:

```text
Component
    ↓
Hook
    ↓
Service
    ↓
NestJS API
```

Conceptually:

```text
RecognitionResultPage
        ↓
useRecognitionJob()
        ↓
recognitionService.getResult()
        ↓
apiClient
        ↓
NestJS
```

---

# 69. API CONTRACT RULE

For this frontend phase:

**DO NOT permanently invent backend endpoints.**

Before creating real API calls:

1. inspect existing API contracts;
2. identify Cosmoz API conventions;
3. reuse shared types;
4. if the OCR backend does not exist yet, use an abstraction;
5. use mocks until the backend contract is available.

Do not simply invent:

```text
POST /api/ocr/analyze
```

because it seems reasonable.

The final contract will be defined when the NestJS/FastAPI OCR module is designed.

---

# 70. DATABASE INDEPENDENCE

The frontend must not know Prisma's database structure.

It must never depend directly on:

```text
Prisma models
```

It should depend on:

```text
API DTOs
```

or shared types.

---

# 71. CODE QUALITY

Maintain:

* strict TypeScript;
* no unnecessary `any`;
* composable components;
* short focused functions;
* UI/logic separation;
* clean hooks;
* separated services;
* centralized validation;
* centralized constants;
* explicit types;
* consistent error handling.

Avoid hacks.

---

# 72. BEFORE CODING

Follow this sequence:

```text
Repository Audit
        ↓
Architecture Audit
        ↓
Design System Audit
        ↓
Routing Audit
        ↓
Auth Audit
        ↓
API Client Audit
        ↓
Implementation
```

Do not replace existing components without a clear reason.

---

# 73. IMPLEMENTATION ORDER

Implement in this order:

### Step 1

Repository audit.

### Step 2

Feature structure.

### Step 3

Types + schemas.

### Step 4

Mock recognition service.

### Step 5

Upload experience.

### Step 6

Preview.

### Step 7

Recognition settings.

### Step 8

Processing state.

### Step 9

Recognition result.

### Step 10

Confidence + warnings.

### Step 11

Field editing.

### Step 12

Trade Draft.

### Step 13

Confirmation.

### Step 14

Success/error states.

### Step 15

History.

### Step 16

Responsive behavior.

### Step 17

Accessibility.

### Step 18

Tests.

### Step 19

Visual QA.

### Step 20

Final architecture review.

---

# 74. DO NOT OVER-ENGINEER

Build a professional architecture while staying strictly within frontend scope.

Do NOT create:

```text
OCR engine
ML pipeline
FastAPI
queues
Redis
RabbitMQ
Kafka
vector database
AI agents
```

These belong to later backend/microservice phases.

The frontend only needs to be **architecturally ready to consume them**.

---

# 75. DEFINITION OF DONE

The frontend feature is complete only when the user can:

```text
1. Open Import & Recognition
        ↓
2. Upload a screenshot
        ↓
3. Preview the screenshot
        ↓
4. Configure recognition
        ↓
5. Start analysis
        ↓
6. See processing progress
        ↓
7. See recognized data
        ↓
8. See confidence scores
        ↓
9. See warnings
        ↓
10. Edit fields
        ↓
11. Validate data
        ↓
12. Generate a Trade Draft
        ↓
13. Review the summary
        ↓
14. Confirm the import
        ↓
15. See success state
        ↓
16. Access the imported trade
        ↓
17. Find the recognition job in History
```

Everything must work using the current mock service.

---

# 76. FINAL VERIFICATION

At completion, verify:

### Architecture

* [ ] No direct FastAPI calls from the browser
* [ ] Correct API abstraction
* [ ] No frontend secrets
* [ ] No Prisma coupling
* [ ] Existing design system reused

### UX

* [ ] Upload
* [ ] Preview
* [ ] Processing
* [ ] Result
* [ ] Review
* [ ] Editing
* [ ] Confidence
* [ ] Warnings
* [ ] Trade Draft
* [ ] Confirmation
* [ ] Success
* [ ] History
* [ ] Errors
* [ ] Empty states

### Technical

* [ ] Strict TypeScript
* [ ] Validation
* [ ] Responsive
* [ ] Accessible
* [ ] Tests
* [ ] No unnecessary dependencies
* [ ] No dead code
* [ ] No duplicated architecture

---

# 77. FINAL REPORT REQUIRED

When implementation is complete, provide a structured report:

## 1. Repository Audit

What already existed.

## 2. Architecture Used

Final feature architecture.

## 3. Components Created

List of components.

## 4. Routes Created

List of routes.

## 5. Services Created

List of services/hooks.

## 6. Types & Schemas

List of frontend models.

## 7. Mock API

Explain how mocks work.

## 8. Integration Readiness

Explain how mocks will later be replaced with NestJS.

## 9. Tests

Tests executed and their results.

## 10. Visual Verification

Desktop / Tablet / Mobile.

## 11. Known Limitations

What intentionally remains for NestJS/FastAPI.

## 12. Recommended Next Step

State precisely what should be built next.

---

# 78. FINAL RULE

You are not simply building an upload page.

You are building the **complete frontend experience of a professional Trade Screenshot Recognition system**, while maintaining strict separation between:

```text
NEXT.JS
→ UX / UI / Review / Draft

NESTJS
→ API / Auth / Authorization / Domain / Persistence

FASTAPI
→ OCR / Computer Vision / Recognition
```

The frontend must be **production-grade, extensible, secure, accessible, and ready for integration with the future Python OCR engine**.

Do not implement any backend functionality in this task.

Start with the repository audit, then progressively implement the feature while respecting the existing Cosmoz architecture.
