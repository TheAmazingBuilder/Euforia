Oui. Je vais conserver **100 % des fonctionnalités proposées**, sans en supprimer une, tout en imposant à l’agent une logique **audit → réutilisation → extension → implémentation → vérification**.

Le prompt ci-dessous est conçu pour ton agent de développement. Il couvre aussi l’amélioration du frontend existant lorsque nécessaire, sans lui permettre de reconstruire arbitrairement l'interface.

# COSMOZ — MASTER IMPLEMENTATION PROMPT

## OCR & Trading Screenshot Recognition V2 — Complete Feature Expansion

---

# 0. ROLE

You are a senior staff-level software engineer and solution architect working on **COSMOZ**, a production-oriented trading journal SaaS.

You are responsible for implementing the complete next-generation OCR and Trading Screenshot Recognition system described in this specification.

You must behave as:

* Senior Backend Engineer
* Senior Python/FastAPI Engineer
* Senior NestJS Engineer
* Senior Next.js/React Engineer
* Software Architect
* Security Engineer
* QA/Test Engineer
* Data/Domain Engineer
* Integration Engineer

You are NOT authorized to blindly redesign the application.

Your first responsibility is to understand the existing system.

Your second responsibility is to determine what already exists.

Your third responsibility is to reuse existing capabilities wherever possible.

Only then may you implement missing functionality.

---

# 1. PRIMARY OBJECTIVE

Upgrade the existing COSMOZ OCR feature into a complete deterministic Trading Screenshot Recognition platform.

The final system must support all of the following capabilities:

1. Single screenshot recognition
2. Multi-screenshot recognition
3. Screenshot grouping
4. Screenshot fingerprinting
5. Duplicate detection
6. Platform detection
7. Screenshot type detection
8. Image validation
9. Image preprocessing
10. OCR
11. Layout detection
12. Bounding boxes
13. Field extraction
14. Field normalization
15. Trading concept recognition
16. Trade reconstruction
17. Cross-field validation
18. Field-level confidence
19. Recognition-level confidence
20. OCR quality scoring
21. Smart correction suggestions
22. User corrections
23. OCR provenance
24. OCR history
25. Trade timeline reconstruction
26. Trade draft generation
27. User confirmation workflow
28. Canonical Trade creation through the existing Trading Core
29. Duplicate trade detection
30. Platform-specific parsers
31. Extensible platform architecture
32. Trade Review prefill
33. Strategy matching suggestions where deterministic data permits
34. Setup matching suggestions where deterministic data permits
35. Playbook matching suggestions where deterministic data permits
36. Screenshot collections
37. Before/after screenshot comparison
38. OCR performance statistics
39. Recognition quality statistics
40. Complete auditability

**Every feature listed above is in scope.**

Do not omit any feature merely because the implementation is more complex.

However:

> If an equivalent feature already exists in the repository, DO NOT rebuild it.

Extend or reuse the existing implementation instead.

---

# 2. ABSOLUTE RULE — AUDIT FIRST

Before changing any source code, perform a complete repository audit.

Do NOT immediately create:

* FastAPI files
* Python packages
* NestJS modules
* Prisma models
* migrations
* React components
* API endpoints
* OCR engines
* queues
* storage systems
* duplicate detection systems
* confidence engines
* history systems

until you have established whether equivalent functionality already exists.

The audit is mandatory.

---

# 3. EXISTING COSMOZ ARCHITECTURE

The canonical architecture is:

```text
COSMOZ
│
├── Frontend
│   └── Next.js
│
├── Backend API
│   └── NestJS
│       └── DDD Modular Monolith
│
├── Database
│   └── PostgreSQL
│       └── Prisma
│
├── Shared Contracts
│   └── @cosmoz/shared
│
└── Specialized Microservice
    └── FastAPI / Python
        └── OCR / Screenshot Recognition
```

The backend remains a modular monolith.

Do NOT introduce unnecessary microservices.

FastAPI exists specifically for specialized computational/image-recognition workloads.

---

# 4. CRITICAL ARCHITECTURAL RULE

The system must preserve this responsibility boundary:

```text
Next.js
    ↓
User Experience / Review / Confirmation
    ↓
NestJS
    ↓
Authorization / Ownership / Orchestration / Domain
    ↓
FastAPI
    ↓
Image Recognition / OCR / Deterministic Extraction
```

FastAPI answers:

> "What does this image appear to contain?"

NestJS answers:

> "Is this operation authorized and how does it enter COSMOZ?"

Trading Core answers:

> "How does this become a canonical Trade?"

The user answers:

> "Is this information correct?"

Prisma answers:

> "How is authoritative COSMOZ data persisted?"

---

# 5. NON-NEGOTIABLE — NO ML / NO LLM

This feature remains **deterministic**.

Do NOT introduce:

* OpenAI
* Claude
* Gemini
* GPT
* LLM extraction
* VLM
* YOLO
* neural networks
* deep learning
* embeddings
* vector databases
* AI agents
* machine-learning classifiers
* generative AI

unless explicitly authorized in a future specification.

Allowed technologies include:

* Tesseract
* pytesseract
* OpenCV
* Pillow
* NumPy
* regex
* deterministic parsers
* template matching
* layout rules
* known platform signatures
* known trading UI labels
* deterministic scoring
* deterministic validation
* perceptual hashing where appropriate

---

# 6. FRONTEND IS ALREADY IMPLEMENTED

The existing OCR frontend has already been implemented.

Therefore:

**DO NOT rebuild the OCR frontend from scratch.**

First inspect it.

Determine:

* what screens already exist
* what components already exist
* upload behavior
* API expectations
* result display
* fields displayed
* review workflow
* correction workflow
* loading states
* error states
* confidence UI
* existing design system
* existing shadcn/ui components
* existing tables
* existing dialogs
* existing cards
* existing notifications
* existing file upload components

Then determine what must be added to consume the expanded backend functionality.

---

# 7. FRONTEND DESIGN IMPROVEMENT RULE

You are authorized to improve the existing OCR frontend **only when necessary to consume the new capabilities correctly**.

The objective is not to redesign the entire application.

Improve the UI/UX where necessary for:

* multi-screenshot workflows
* screenshot grouping
* image previews
* bounding boxes
* field confidence
* correction workflow
* duplicate warnings
* OCR quality
* recognition issues
* platform detection
* screenshot type detection
* timeline
* OCR history
* trade draft review
* before/after comparison
* collection management
* review/confirmation

Preserve:

* COSMOZ visual language
* existing design system
* existing navigation
* existing typography
* existing spacing conventions
* existing component patterns
* existing responsive behavior

Reuse existing components before creating new ones.

Do not introduce a second design system.

---

# 8. DUPLICATE FUNCTIONALITY RULE

This rule has absolute priority.

For every proposed capability:

```text
Search existing repository
        ↓
Identify equivalent functionality
        ↓
Determine whether it can be reused
        ↓
Extend if necessary
        ↓
Only create new functionality if genuinely missing
```

If something equivalent already exists:

> IGNORE the duplicate implementation requirement and reuse the existing system.

Examples:

If an existing:

* file upload service exists → reuse it
* image storage abstraction exists → reuse it
* job/queue system exists → reuse it
* audit logging exists → reuse it
* notification system exists → reuse it
* confidence model exists → extend it
* duplicate detection exists → extend it
* hashing utility exists → reuse it
* Trade Draft exists → reuse it
* Trade creation workflow exists → reuse it
* review workflow exists → extend it
* OCR service exists → extend it
* monitoring system exists → reuse it
* rate limiter exists → reuse it
* authentication exists → reuse it
* shared Zod contract exists → extend it

Do NOT create another version.

---

# 9. PHASE 0 — COMPLETE REPOSITORY AUDIT

Before implementation, inspect:

## Repository

* directory structure
* package managers
* workspace configuration
* monorepo configuration
* package.json
* lockfiles
* tsconfig
* eslint
* prettier
* Docker
* compose
* environment files
* CI
* tests
* scripts
* documentation

## Frontend

Inspect:

* OCR pages
* OCR components
* upload components
* result components
* image preview components
* tables
* forms
* dialogs
* notifications
* loading states
* API clients
* shared types
* state management

## NestJS

Inspect:

* modules
* controllers
* services
* application layer
* domain layer
* infrastructure layer
* guards
* policies
* ownership checks
* Prisma
* queues
* jobs
* events
* WebSockets/SSE
* storage
* audit
* monitoring

## FastAPI

Determine:

* whether FastAPI already exists
* whether Python already exists
* where it lives
* whether it is runnable
* current architecture
* current endpoints
* current dependencies
* current OCR engine
* current image processing
* current tests

## Database

Inspect:

* Prisma schema
* migrations
* Trade
* TradeExecution
* TradePlan
* Accounts
* Integrations
* Audit
* existing OCR tables
* existing upload/file tables
* existing job tables
* existing review/draft tables

---

# 10. MANDATORY PYTHON / FASTAPI DEPENDENCY AUDIT

Before installing ANY dependency:

Determine:

```text
Does Python already exist?
Does FastAPI already exist?
Does a Python virtual environment exist?
Does pyproject.toml exist?
Does requirements.txt exist?
Does Poetry exist?
Does uv exist?
Does pip-tools exist?
Does Docker already define the environment?
Does Tesseract already exist?
Does pytesseract already exist?
Does Pillow already exist?
Does OpenCV already exist?
Does NumPy already exist?
```

Verify actual imports and executable availability.

Do not conclude:

> "Tesseract is installed"

because:

```python
import pytesseract
```

works.

Verify the actual system binary.

For example:

```text
tesseract --version
```

and verify language packs.

---

# 11. DEPENDENCY DECISION TREE

For every dependency:

```text
Already installed?
    ↓
YES → reuse

NO
    ↓
Already available indirectly?
    ↓
YES → reuse if appropriate

NO
    ↓
Actually required?
    ↓
NO → do not install

YES
    ↓
Choose minimal stable dependency
```

Never install packages blindly.

Never introduce a package merely because it is popular.

---

# 12. AUDIT REPORT REQUIREMENT

Before implementation, produce an internal audit containing:

```text
Existing OCR functionality:
Existing upload system:
Existing image storage:
Existing job system:
Existing notification system:
Existing audit system:
Existing duplicate detection:
Existing hashing utilities:
Existing Trade Draft:
Existing Trade creation:
Existing Trade Review:
Existing Strategy matching:
Existing Playbook:
Existing analytics:
Existing frontend components:
Existing FastAPI:
Existing OCR engine:
Existing Python dependencies:
Existing system dependencies:
Missing capabilities:
Capabilities to extend:
Capabilities to create:
```

Then implement.

Do not stop after producing the audit.

---

# 13. TARGET OCR PIPELINE

The final architecture should support:

```text
Screenshot(s)
      ↓
Image Validation
      ↓
Fingerprinting
      ↓
Duplicate Detection
      ↓
Platform Detection
      ↓
Screenshot Type Detection
      ↓
Preprocessing
      ↓
OCR
      ↓
Layout Detection
      ↓
Bounding Boxes
      ↓
Field Extraction
      ↓
Normalization
      ↓
Trading Concept Recognition
      ↓
Cross-Field Validation
      ↓
Confidence Engine
      ↓
Trade Reconstruction
      ↓
Multi-Screenshot Fusion
      ↓
Timeline Reconstruction
      ↓
Trade Draft
      ↓
User Review
      ↓
User Correction
      ↓
User Confirmation
      ↓
Existing Trading Core
      ↓
Canonical Trade
      ↓
Trade Review / Analytics / Playbook linkage
```

---

# 14. FEATURE 1 — MULTI-SCREENSHOT RECOGNITION

Implement support for multiple screenshots belonging to one trading event.

The system must support:

```text
Screenshot A
Screenshot B
Screenshot C
      ↓
Recognition
      ↓
Correlation
      ↓
Fusion
      ↓
Single Trade Draft
```

Examples:

```text
Screenshot 1:
Entry

Screenshot 2:
Position with SL/TP

Screenshot 3:
Exit/result
```

The system must determine whether screenshots likely belong to the same trade.

Do not merge blindly.

Use deterministic evidence such as:

* symbol
* direction
* account
* platform
* external trade ID
* order ID
* volume
* timestamps
* entry price
* exit price
* screenshot type
* temporal proximity
* recognized UI context

If confidence is insufficient:

```text
POSSIBLE GROUP
```

and ask the user to confirm.

---

# 15. FEATURE 2 — SCREENSHOT GROUPING

Support explicit and automatic grouping.

The user must be able to:

* upload multiple screenshots
* create a recognition session
* reorder screenshots
* remove screenshots
* add screenshots
* inspect individual recognition
* inspect merged recognition
* confirm grouping

Never destroy individual recognition results after fusion.

---

# 16. FEATURE 3 — SCREENSHOT FINGERPRINTING

Implement deterministic screenshot fingerprinting.

Possible approach:

* perceptual hash
* normalized image fingerprint
* metadata-independent fingerprint

The system must detect:

* exact duplicate
* resized duplicate
* recompressed duplicate
* near-identical screenshot

Do not rely exclusively on filename.

---

# 17. FEATURE 4 — DUPLICATE DETECTION

Detect two classes of duplicates:

### Screenshot duplicate

Same or near-identical image.

### Trade duplicate

Different screenshots representing the same trade.

Trade duplicate detection may use:

* external trade ID
* order ID
* account
* symbol
* direction
* volume
* entry
* exit
* timestamps
* normalized identifiers

Never silently reject an import.

Display:

```text
Possible duplicate detected
```

and let the user decide.

---

# 18. FEATURE 5 — PLATFORM DETECTION

Implement deterministic platform recognition.

Initial architecture must support:

```text
MT5
MT4
TradingView
cTrader
NinjaTrader
Interactive Brokers
Deriv
Other / Unknown
```

Do not pretend every platform is fully supported immediately.

Platform detection should be separate from platform parsing.

Architecture:

```text
PlatformDetector
    ↓
MT5Recognizer
MT4Recognizer
TradingViewRecognizer
...
```

Unsupported platforms must return:

```text
UNKNOWN_PLATFORM
```

rather than fabricated results.

---

# 19. FEATURE 6 — SCREENSHOT TYPE DETECTION

Detect:

```text
TRADE_HISTORY
OPEN_POSITION
ORDER
TRADE_DETAIL
ACCOUNT_SUMMARY
CHART
POSITION_DETAIL
UNKNOWN
```

Use deterministic signatures.

Example:

```text
MT5
+
History table
+
Deal columns
=
TRADE_HISTORY
```

---

# 20. FEATURE 7 — IMAGE VALIDATION

Validate:

* MIME type
* file extension
* file signature
* file size
* dimensions
* pixel count
* image format
* corruption
* decompression bomb risk

Protect against:

* memory exhaustion
* CPU exhaustion
* malformed image payloads
* oversized dimensions
* malicious files

Never trust client-side validation.

FastAPI must independently validate the image.

---

# 21. FEATURE 8 — IMAGE PREPROCESSING

Build deterministic preprocessing where beneficial:

* resize
* grayscale
* contrast enhancement
* denoising
* thresholding
* sharpening
* crop
* rotation correction
* orientation detection
* region extraction

Avoid blindly applying every transformation.

The system should select preprocessing strategies based on deterministic image characteristics.

---

# 22. FEATURE 9 — OCR

Support OCR extraction with:

* raw text
* confidence
* word positions
* bounding boxes
* line information where available
* preprocessing variant
* OCR engine version

Preserve raw OCR separately from normalized interpretation.

---

# 23. FEATURE 10 — BOUNDING BOXES

Every recognized field should support spatial metadata where available:

```text
Field
Value
BoundingBox
OCRConfidence
NormalizedValue
```

The frontend must be able to overlay these regions on the screenshot.

---

# 24. FEATURE 11 — FIELD EXTRACTION

Potential fields:

```text
platform
screen_type
symbol
direction
volume
entry_price
exit_price
stop_loss
take_profit
profit_loss
commission
swap
open_time
close_time
trade_id
order_id
account_identifier
currency
timeframe
```

Only persist fields actually supported by the domain and frontend.

Do not invent values.

---

# 25. FEATURE 12 — NORMALIZATION

Examples:

```text
BUY → LONG
SELL → SHORT
```

Normalize:

* symbol
* direction
* decimals
* separators
* currency
* timestamps
* platform labels
* trade identifiers

Never silently modify ambiguous data.

---

# 26. FEATURE 13 — SMART CORRECTION

When OCR produces:

```text
264S.20
```

the system may propose:

```text
2645.20
```

But must mark it:

```text
SYSTEM_SUGGESTED
```

Never silently replace uncertain values.

Support:

```text
Original OCR
Normalized value
Suggested correction
User correction
Final confirmed value
```

---

# 27. FEATURE 14 — FIELD-LEVEL CONFIDENCE

Every important extracted field must support deterministic confidence.

Example:

```text
Symbol       99%
Direction    99%
Volume       97%
Entry        94%
SL           91%
TP           96%
```

Confidence must be explainable.

Do not create meaningless random percentages.

---

# 28. FEATURE 15 — OCR QUALITY SCORE

Provide an overall recognition quality score.

Example:

```text
OCR QUALITY
92%
```

With components:

```text
Text recognition
Field extraction
Trading interpretation
Cross-field validation
Multi-screenshot consistency
```

The score must be deterministic and documented.

---

# 29. FEATURE 16 — RECOGNITION ISSUES

Support structured issues such as:

```text
LOW_OCR_CONFIDENCE
UNKNOWN_PLATFORM
UNKNOWN_SCREEN_TYPE
UNKNOWN_SYMBOL
AMBIGUOUS_DIRECTION
AMBIGUOUS_NUMBER
INVALID_PRICE_RELATIONSHIP
MISSING_REQUIRED_FIELD
INVALID_TIMESTAMP
CONFLICTING_FIELDS
UNSUPPORTED_SCREENSHOT
POSSIBLE_DUPLICATE
POSSIBLE_TRADE_DUPLICATE
```

The frontend must display actionable explanations.

---

# 30. FEATURE 17 — CROSS-FIELD VALIDATION

For LONG:

```text
SL < Entry < TP
```

For SHORT:

```text
SL > Entry > TP
```

Also validate:

* close time >= open time
* volume > 0
* prices valid
* timestamps valid
* P&L consistency where calculable
* commission/swap semantics
* symbol consistency
* account consistency

Do not silently repair inconsistencies.

---

# 31. FEATURE 18 — MULTI-SCREENSHOT FUSION

When multiple screenshots describe the same trade:

```text
Recognition A
Recognition B
Recognition C
        ↓
Fusion Engine
```

The fusion engine must:

* preserve provenance
* resolve consistent values
* identify conflicts
* prioritize stronger evidence
* preserve conflicting values
* produce confidence
* never silently discard conflicting evidence

Example:

```text
Screenshot A:
Entry = 2645.20

Screenshot B:
Entry = 2645.30
```

Result:

```text
CONFLICTING_FIELDS
```

User decides.

---

# 32. FEATURE 19 — TRADE RECONSTRUCTION

Convert recognized information into a structured:

```text
TradeDraft
```

It is NOT yet a canonical Trade.

Example:

```text
TradeDraft
├── account
├── platform
├── symbol
├── direction
├── volume
├── entry
├── exit
├── SL
├── TP
├── P&L
├── timestamps
├── external identifiers
├── confidence
├── issues
└── provenance
```

---

# 33. FEATURE 20 — HUMAN-IN-THE-LOOP

Never:

```text
Screenshot
↓
OCR
↓
Automatic Trade
```

Always:

```text
Screenshot
↓
OCR
↓
Trade Draft
↓
User Review
↓
User Confirmation
↓
Canonical Trade
```

---

# 34. FEATURE 21 — OCR HISTORY

Maintain an auditable recognition history.

Users should be able to see:

```text
Oct 5
XAUUSD BUY
Confirmed

Oct 4
NAS100 SELL
2 fields corrected

Oct 3
EURUSD BUY
Confirmed
```

History must distinguish:

* recognized
* corrected
* rejected
* confirmed
* failed
* duplicate
* cancelled

---

# 35. FEATURE 22 — PROVENANCE

Track provenance:

```text
OCR
SYSTEM_NORMALIZED
SYSTEM_DERIVED
SYSTEM_SUGGESTED
USER_CORRECTED
USER_CONFIRMED
```

Never lose the original recognized value.

---

# 36. FEATURE 23 — TRADE TIMELINE

Build deterministic chronology where possible.

Example:

```text
09:32
Entry screenshot

09:47
Position screenshot

10:05
Exit screenshot

10:06
Trade confirmed
```

Use recognized timestamps when available.

Never invent missing timestamps.

---

# 37. FEATURE 24 — TRADE REVIEW PREFILL

After Trade confirmation, reuse the existing Trade Review system.

Prefill factual information:

* symbol
* direction
* entry
* exit
* SL
* TP
* result
* duration
* volume
* platform
* source

Do not create a second Trade Review system.

---

# 38. FEATURE 25 — STRATEGY MATCHING

Where deterministic information permits, suggest matching existing:

* Strategy
* Strategy Version
* Setup
* Playbook

Examples:

```text
Recognized symbol = XAUUSD
Direction = BUY
Timeframe = M5
```

Potential matches may be displayed.

But:

> Never automatically assign a strategy unless the existing domain explicitly supports deterministic matching.

Suggestions are suggestions.

---

# 39. FEATURE 26 — PLAYBOOK MATCHING

Reuse the existing Playbook bounded context.

Never create OCR-specific playbooks.

Possible output:

```text
Possible Playbook:
Gold Scalping

Confidence:
78%

Reason:
Symbol = XAUUSD
Timeframe = M5
Setup characteristics = ...
```

Only use information actually available.

---

# 40. FEATURE 27 — SETUP MATCHING

Same rule.

Reuse existing Setup entities.

Do not duplicate:

* Setup
* Strategy
* Rule
* Checklist

inside OCR.

---

# 41. FEATURE 28 — SCREENSHOT COLLECTIONS

Allow users to organize screenshots into collections.

Potential examples:

```text
Gold Scalping
London Session
Winning Trades
Losing Trades
MT5 Imports
Trade Reviews
```

Reuse existing Nofy/content/file systems where appropriate.

Do not build a second generic document-storage system.

---

# 42. FEATURE 29 — BEFORE / AFTER COMPARISON

Support comparison of screenshots when useful.

Examples:

```text
Before Entry
vs
After Exit
```

Show:

* side-by-side
* synchronized zoom
* metadata
* recognized fields
* timeline relation

This must remain a trading screenshot feature, not a generic image editor.

---

# 43. FEATURE 30 — OCR PERFORMANCE DASHBOARD

Add recognition statistics where useful.

Metrics may include:

```text
Screenshots processed
Successful recognitions
Failed recognitions
Average confidence
Average processing time
Correction rate
Duplicate rate
Platform distribution
Screenshot type distribution
Most frequently corrected fields
```

Do not duplicate the existing global Analytics system unnecessarily.

If these metrics belong in Monitoring, use Monitoring.

If they represent user trading behavior, use Analytics.

If they represent OCR system health, use Monitoring.

Respect bounded contexts.

---

# 44. FEATURE 31 — DETERMINISTIC RECOGNITION VERSIONING

Store enough information to understand how recognition was produced.

Example:

```text
OCR Engine Version
Parser Version
Platform Parser Version
Recognition Schema Version
```

This allows future reprocessing.

---

# 45. FEATURE 32 — REPROCESSING

Allow reprocessing when recognition logic changes.

Do not mutate historical user-confirmed Trade data automatically.

Reprocessing should produce a new recognition result or revision.

---

# 46. FEATURE 33 — CONFIRMATION IMMUTABILITY

Once the user confirms a Trade:

```text
OCR result
    ↓
Trade Draft
    ↓
Confirmed Trade
```

The canonical Trade becomes governed by the Trading Core.

Later OCR reprocessing must NOT silently mutate it.

---

# 47. FEATURE 34 — ACCOUNT OWNERSHIP

Any recognized account identifier must be matched only against accounts belonging to the authenticated user.

Never allow:

```text
User A screenshot
→ User B account
```

Prevent IDOR.

---

# 48. FEATURE 35 — SECURITY

Implement:

* authentication
* authorization
* ownership
* IDOR protection
* upload validation
* file-size limits
* image-dimension limits
* CPU limits
* memory protection
* rate limiting
* service-to-service authentication
* secure storage
* secret protection
* raw image privacy
* audit logging
* sensitive log redaction

Never log raw screenshots.

Never expose credentials.

Never expose provider secrets to FastAPI unless explicitly required and securely designed.

---

# 49. FEATURE 36 — FASTAPI DATABASE RULE

FastAPI must NOT own the COSMOZ database.

FastAPI must NOT directly write Prisma/PostgreSQL business entities.

Preferred:

```text
FastAPI
↓
RecognitionResult
↓
NestJS
↓
Trade Draft
↓
Trading Core
↓
Prisma
```

---

# 50. FEATURE 37 — ASYNCHRONOUS JOBS

If processing can be long-running:

```text
Upload
↓
OCRJob
↓
PENDING
↓
PROCESSING
↓
COMPLETED / FAILED / CANCELLED
```

Reuse existing queue infrastructure.

Do NOT create another queue if one already exists.

---

# 51. FEATURE 38 — JOB IDEMPOTENCY

Jobs must tolerate:

* retries
* duplicate requests
* worker restart
* timeout
* partial failure

Never create duplicate Trades because a job was retried.

---

# 52. FEATURE 39 — ERROR RECOVERY

Support:

* retry
* failure state
* actionable error
* timeout
* cancellation
* partial recognition
* unsupported screenshot
* corrupt image
* OCR unavailable
* FastAPI unavailable

Never hide failures.

---

# 53. FEATURE 40 — FRONTEND RECOGNITION WORKSPACE

Improve the existing OCR UI where required.

The ideal workflow should be approximately:

```text
Upload
   ↓
Processing
   ↓
Recognition Workspace
   ↓
Image Preview
   +
Detected Fields
   +
Confidence
   +
Issues
   +
Platform
   +
Screenshot Type
   +
Bounding Boxes
   ↓
Corrections
   ↓
Multi-Screenshot Fusion
   ↓
Trade Draft
   ↓
Review
   ↓
Confirm
```

---

# 54. FRONTEND — MULTI-SCREENSHOT UI

Support:

* drag & drop
* multiple uploads
* thumbnails
* ordering
* remove
* retry
* recognition status
* grouping
* individual result
* merged result

---

# 55. FRONTEND — IMAGE INSPECTION

Support:

* zoom
* pan
* bounding boxes
* field highlighting
* confidence visualization
* selected field → corresponding image region
* image → corresponding field

Do not introduce a heavyweight image editor unless necessary.

---

# 56. FRONTEND — FIELD REVIEW

Each field should support:

```text
Detected:
2645.20

Confidence:
94%

Suggested:
2645.30

[Accept]
[Edit]
[Reject]
```

---

# 57. FRONTEND — ISSUES

Display:

```text
⚠ Possible ambiguity

Entry price has conflicting values
between screenshots.
```

The UI must make conflicts understandable.

---

# 58. FRONTEND — DUPLICATE WARNING

Display:

```text
Possible duplicate trade

This screenshot may represent an existing trade.

[Review Existing]
[Import Anyway]
[Cancel]
```

Never automatically discard user data.

---

# 59. FRONTEND — TRADE DRAFT

The Trade Draft screen must clearly distinguish:

```text
Recognized data
vs
Confirmed data
```

The user must know what has been modified.

---

# 60. FRONTEND — CONFIRMATION

Confirmation should be explicit.

Example:

```text
Everything looks correct?

[Confirm Trade]
[Continue Editing]
[Cancel]
```

Do not automatically create a Trade merely because OCR completed.

---

# 61. FRONTEND — TIMELINE

When timestamps exist:

```text
09:32 Entry
09:47 Position
10:05 Exit
```

Show screenshot associations.

---

# 62. FRONTEND — OCR HISTORY

Provide a history view reusing existing application patterns.

Support filters:

* status
* platform
* date
* confidence
* screenshot type
* duplicate
* corrected

---

# 63. FRONTEND — COLLECTIONS

Provide a clean collection experience if the current application architecture supports it.

Avoid creating a generic file-management UI.

---

# 64. FRONTEND — RESPONSIVE DESIGN

Everything must remain usable on:

* desktop
* laptop
* tablet

Do not sacrifice the existing COSMOZ responsive design.

---

# 65. FRONTEND — ACCESSIBILITY

Support:

* keyboard navigation
* focus states
* semantic controls
* readable contrast
* accessible dialogs
* accessible status messages
* screen-reader-friendly labels

---

# 66. CONTRACTS

All communication between:

```text
Next.js
↕
NestJS
↕
FastAPI
```

must use explicit contracts.

Use existing:

```text
@cosmoz/shared
```

where applicable.

Do not expose Prisma models directly.

---

# 67. FASTAPI RESPONSE CONTRACT

Recognition responses should conceptually contain:

```text
job
platform
screenshot_type
images
ocr
fields
confidence
issues
fingerprint
duplicates
timeline
trade_candidate
provenance
engine_version
```

Adapt the exact contract to the repository.

Do not blindly create duplicate DTO systems.

---

# 68. FIELD CONTRACT

A field should conceptually support:

```text
field_name
raw_value
normalized_value
confidence
bounding_box
source
provenance
issues
```

---

# 69. DOMAIN BOUNDARY

OCR owns:

```text
Recognition
Extraction
Confidence
Screenshot metadata
Recognition provenance
Recognition issues
```

Trading Core owns:

```text
Canonical Trade
TradeExecution
P&L authority
Trade lifecycle
External trade mapping
```

Trade Review owns:

```text
Post-trade reflection
Review
Lessons
Rule adherence
```

Playbook owns:

```text
Strategies
Setups
Rules
Checklists
```

Analytics owns:

```text
Performance
Risk
Behavior
Consistency
```

Nofy owns:

```text
Personal knowledge / notes
```

Do not cross these boundaries.

---

# 70. NO OCR-SPECIFIC TRADE SYSTEM

Do NOT create:

```text
OcrTrade
ScreenshotTrade
RecognizedTrade
OCRTradeEntity
```

as an alternative canonical trade model.

Use:

```text
RecognitionResult
        ↓
TradeDraft
        ↓
Existing Trading Core
```

---

# 71. DATA PERSISTENCE

Before adding tables, inspect existing schema.

Potential entities may include:

```text
OCRJob
RecognitionResult
RecognitionField
Screenshot
ScreenshotGroup
RecognitionIssue
RecognitionProvenance
TradeDraft
```

But create only what is genuinely necessary.

Do not create tables that duplicate existing entities.

---

# 72. PRISMA RULE

Prisma is infrastructure.

Do not put business logic inside Prisma models.

Domain/application services must remain responsible for behavior.

---

# 73. TESTING — REQUIRED

Implement tests for every meaningful capability.

## Unit tests

Test:

* preprocessing
* fingerprinting
* duplicate detection
* platform detection
* screenshot classification
* OCR parsing
* number parsing
* normalization
* confidence
* validation
* cross-field validation
* fusion
* timeline reconstruction
* trade reconstruction

---

# 74. INTEGRATION TESTS

Test:

```text
NestJS
↕
FastAPI
```

including:

* valid response
* malformed response
* timeout
* unavailable service
* invalid recognition
* version mismatch
* retry
* duplicate job

---

# 75. SECURITY TESTS

Explicitly test:

* unauthorized OCR job
* another user's job
* another user's screenshot
* another user's Trade Draft
* another user's account
* forged account ID
* forged Trade ID
* malicious file
* oversized file
* malformed image
* duplicate confirmation
* replayed confirmation
* unauthorized reprocessing

---

# 76. MULTI-SCREENSHOT TESTS

Test:

```text
one screenshot
two screenshots
three screenshots
same trade
different trades
conflicting screenshots
missing timestamps
different platforms
duplicate screenshots
partial information
```

---

# 77. CONFIDENCE TESTS

Ensure confidence is:

* deterministic
* reproducible
* explainable
* bounded
* not arbitrary

Same input should produce the same result.

---

# 78. E2E TEST

Implement the complete flow:

```text
Upload screenshot
↓
Create job
↓
Process
↓
Recognition
↓
Display result
↓
Correct field
↓
Confirm
↓
Create canonical Trade
↓
Open Trade
↓
Open Trade Review
```

Also test failure paths.

---

# 79. DUPLICATE E2E

Test:

```text
Import Trade A
↓
Import same screenshot
↓
Duplicate warning
↓
Review
```

and:

```text
Different screenshot
↓
Same trade
↓
Trade duplicate detection
```

---

# 80. MULTI-SCREENSHOT E2E

Test:

```text
Upload entry screenshot
+
position screenshot
+
exit screenshot
↓
Recognize
↓
Group
↓
Fuse
↓
Review
↓
Confirm
↓
Canonical Trade
```

---

# 81. BUILD VERIFICATION

Before completion run the repository's appropriate:

* install validation
* typecheck
* lint
* unit tests
* integration tests
* contract tests
* E2E tests
* build
* FastAPI startup
* NestJS startup
* frontend startup
* OCR health check
* clean environment verification where feasible

Do not claim success without actual evidence.

---

# 82. RUNTIME VERIFICATION

Verify:

```text
Next.js
    ↓
NestJS
    ↓
FastAPI
```

in a real runtime environment.

Verify:

* authentication
* upload
* OCR
* recognition result
* frontend display
* correction
* confirmation
* Trade creation

---

# 83. OBSERVABILITY

Reuse the existing Monitoring infrastructure.

Track:

* OCR processing time
* queue latency
* failure rate
* OCR errors
* unsupported screenshots
* service availability
* retry rate
* duplicate rate
* recognition confidence
* correction rate

Do not create a second monitoring platform.

---

# 84. PRIVACY

Trading screenshots may contain:

* account identifiers
* balances
* broker information
* personal information
* financial information

Therefore:

* never log raw screenshots
* restrict access
* enforce ownership
* redact sensitive logs
* secure storage
* define retention behavior
* audit access where appropriate

---

# 85. PERFORMANCE

Do not optimize prematurely.

Measure first.

Potential optimizations:

* image resizing
* preprocessing limits
* bounded OCR resolution
* caching deterministic fingerprints
* asynchronous jobs
* controlled worker concurrency
* timeout protection

Do not introduce complex infrastructure without evidence.

---

# 86. FAILURE ISOLATION

If FastAPI fails:

```text
NestJS remains operational
```

The frontend must receive a meaningful state:

```text
OCR_SERVICE_UNAVAILABLE
```

The system must not corrupt Trade data.

---

# 87. VERSIONING

Recognition should identify:

```text
OCR engine version
parser version
recognition schema version
platform parser version
```

This supports reproducibility and future migration.

---

# 88. IMPLEMENTATION ORDER

Follow this order unless the repository proves a better dependency order:

### Phase A

Audit existing architecture.

### Phase B

Audit FastAPI/Python/dependencies.

### Phase C

Audit existing frontend OCR.

### Phase D

Audit existing data/domain capabilities.

### Phase E

Define missing contracts.

### Phase F

Implement/extend FastAPI recognition foundation.

### Phase G

Implement platform and screenshot classification.

### Phase H

Implement fingerprinting and duplicate detection.

### Phase I

Implement OCR/layout/bounding boxes.

### Phase J

Implement extraction/normalization.

### Phase K

Implement validation/confidence/issues.

### Phase L

Implement multi-screenshot fusion.

### Phase M

Implement Trade Draft.

### Phase N

Integrate with Trading Core.

### Phase O

Implement OCR history/timeline/provenance.

### Phase P

Implement Strategy/Setup/Playbook suggestions.

### Phase Q

Implement screenshot collections/comparison.

### Phase R

Improve frontend UX.

### Phase S

Testing.

### Phase T

Runtime verification.

### Phase U

Final audit.

---

# 89. INCREMENTAL IMPLEMENTATION RULE

Do not implement the entire feature in one uncontrolled change.

Use vertical slices.

Example:

```text
Slice 1
Upload → OCR → Result

Slice 2
Confidence → Issues → Validation

Slice 3
Fingerprint → Duplicate

Slice 4
Multi-screenshot → Fusion

Slice 5
Trade Draft → Confirmation

Slice 6
Trading Core

Slice 7
History → Timeline

Slice 8
Platform-specific recognition

Slice 9
Collections → Comparison

Slice 10
Strategy/Setup/Playbook suggestions
```

Verify every slice.

---

# 90. NO UNRELATED REFACTORING

Do not:

* rename unrelated modules
* rewrite architecture
* migrate unrelated dependencies
* redesign unrelated screens
* replace authentication
* replace Prisma
* replace NestJS
* replace Next.js
* replace existing queue
* replace existing storage
* replace existing monitoring

unless strictly required.

---

# 91. GIT SAFETY

Before modifying:

* inspect git status
* inspect current diff
* preserve user changes
* do not reset unrelated changes
* do not commit unless explicitly authorized
* do not push unless explicitly authorized

---

# 92. DOCUMENTATION

Update documentation for:

* OCR architecture
* API contracts
* FastAPI service
* supported platforms
* screenshot types
* recognition pipeline
* confidence
* issues
* duplicate detection
* multi-screenshot workflow
* Trade Draft
* confirmation flow
* local development
* dependency requirements
* Tesseract/system requirements if applicable
* testing

Do not create duplicate documentation if an existing document should be extended.

---

# 93. LOCAL DEVELOPMENT

Ensure developers can understand:

```text
How to start Next.js
How to start NestJS
How to start FastAPI
How to install Python dependencies
How to install system OCR dependencies
How to run tests
How to run OCR locally
```

Follow existing project conventions.

---

# 94. DOCKER

If Docker already exists:

* inspect it
* extend it where necessary
* preserve conventions

Do not create a second container strategy.

If Tesseract is required, ensure the system package and language data are available in the actual runtime environment.

---

# 95. ENVIRONMENT VARIABLES

Never hardcode:

* secrets
* service credentials
* URLs
* API keys

Reuse existing configuration infrastructure.

---

# 96. NO AUTOMATIC TRADE EXECUTION

This feature remains journal/import functionality.

It must NEVER:

```text
Place Order
Modify Order
Cancel Order
Close Position
Modify SL
Modify TP
```

OCR has zero execution authority.

---

# 97. FINAL ARCHITECTURAL FLOW

The intended final architecture is:

```text
                    COSMOZ FRONTEND
                         │
                         ▼
              OCR Recognition Workspace
                         │
                         ▼
                    NestJS API
                         │
             ┌───────────┴───────────┐
             │                       │
             ▼                       ▼
        OCR Job Manager        Authorization
             │
             ▼
       FastAPI OCR Service
             │
      ┌──────┼─────────┐
      ▼      ▼         ▼
   Image   OCR      Recognition
   Engine  Engine      Engine
      │      │         │
      └──────┼─────────┘
             ▼
      RecognitionResult
             │
             ▼
      NestJS Validation
             │
             ▼
      Multi-Screenshot
          Fusion
             │
             ▼
        Trade Draft
             │
             ▼
        User Review
             │
             ▼
      User Confirmation
             │
             ▼
      Existing Trading Core
             │
             ▼
       Canonical Trade
             │
       ┌─────┼──────────────┐
       ▼     ▼              ▼
 Trade Review Analytics   Playbook
```

---

# 98. ACCEPTANCE CRITERIA

The implementation is complete only when:

* existing OCR functionality still works
* no duplicate functionality was unnecessarily created
* FastAPI dependencies were audited before installation
* system OCR dependencies were verified
* no ML/LLM was introduced
* single screenshot recognition works
* multi-screenshot recognition works
* screenshot grouping works
* screenshot fingerprinting works
* duplicate detection works
* platform detection works
* screenshot type detection works
* preprocessing works
* OCR works
* bounding boxes work where supported
* field extraction works
* normalization works
* confidence works
* quality score works
* issue reporting works
* smart correction works
* cross-field validation works
* multi-screenshot fusion works
* provenance works
* timeline works
* OCR history works
* Trade Draft works
* user confirmation works
* canonical Trade creation uses Trading Core
* duplicate Trade protection works
* Trade Review can consume confirmed Trade data
* strategy/setup/playbook suggestions work where supported
* screenshot collections work
* screenshot comparison works
* OCR/system metrics are available in the appropriate existing observability surface
* security tests pass
* ownership tests pass
* IDOR tests pass
* E2E tests pass
* frontend consumes the complete backend capability
* frontend design remains consistent with COSMOZ
* responsive behavior works
* build passes
* typecheck passes
* lint passes
* FastAPI starts successfully
* NestJS starts successfully
* frontend starts successfully
* runtime integration succeeds.

---

# 99. EVIDENCE REQUIREMENT

Never report:

> "Implemented successfully"

based only on code inspection.

You must provide fresh evidence.

For every major capability, identify:

```text
Implementation
Test
Verification result
```

Example:

```text
Multi-screenshot fusion
→ test_multi_screenshot_fusion
→ PASS
```

---

# 100. FINAL AUDIT

Before finishing, perform a final audit against:

```text
Architecture
Domain boundaries
Security
Authorization
Data ownership
Contracts
FastAPI
NestJS
Prisma
Frontend
OCR
Multi-screenshot
Fingerprinting
Duplicates
Confidence
Validation
Corrections
History
Timeline
Trade Draft
Trading Core
Trade Review
Playbook
Analytics
Monitoring
Performance
Testing
Documentation
```

---

# 101. FINAL DIFF REVIEW

Inspect the complete diff.

Look specifically for:

* duplicate services
* duplicate components
* duplicate DTOs
* duplicate Prisma models
* unnecessary dependencies
* secrets
* debug code
* raw screenshot logging
* unsafe file handling
* weak authorization
* IDOR
* race conditions
* duplicate Trade creation
* silent data mutation
* unrelated changes
* dead code
* misleading confidence
* fabricated OCR values

Fix only issues within this scope.

---

# 102. STOP CONDITION

When all requested OCR capabilities are implemented, verified, documented, and integrated:

STOP.

Do not continue into unrelated features.

Do not implement:

* Backtesting
* AI trading assistant
* automated trading
* broker execution
* new microservices
* unrelated analytics
* unrelated redesigns

unless explicitly requested.

---

# 103. CORE PRINCIPLE

The final system must follow this hierarchy:

```text
IMAGE
  ↓
RECOGNITION
  ↓
EVIDENCE
  ↓
CONFIDENCE
  ↓
VALIDATION
  ↓
USER REVIEW
  ↓
USER CONFIRMATION
  ↓
DOMAIN TRUTH
```

Never:

```text
IMAGE
  ↓
OCR
  ↓
AUTOMATIC TRUTH
```

OCR is an evidence-generation system.

It is not the source of truth.

The user and existing COSMOZ domain model remain the authority.

---

# 104. FINAL REPORT

At completion, report:

## 1. Audit findings

What already existed?

What was reused?

What was extended?

What was genuinely new?

## 2. Backend

FastAPI changes.

NestJS changes.

Database changes.

Contracts.

## 3. Frontend

Existing components reused.

New components.

UX improvements.

## 4. Recognition

OCR.

Platform detection.

Screenshot classification.

Extraction.

Validation.

Confidence.

## 5. Multi-screenshot

Grouping.

Fusion.

Timeline.

Conflict handling.

## 6. Duplicate detection

Screenshot duplicates.

Trade duplicates.

Fingerprinting.

## 7. Trading integration

Trade Draft.

Confirmation.

Trading Core integration.

## 8. Security

Authorization.

Ownership.

Upload security.

Service authentication.

## 9. Testing

List actual commands executed and results.

## 10. Remaining limitations

Only genuine limitations.

Do not hide incomplete work.

---

# 105. ABSOLUTE FINAL RULE

The agent must never say:

> "This feature already exists, so I ignored it"

without first verifying whether the existing implementation actually satisfies the requirement.

Likewise, the agent must never say:

> "I implemented this feature"

without verifying it.

The workflow is:

```text
AUDIT
  ↓
UNDERSTAND
  ↓
REUSE
  ↓
EXTEND
  ↓
IMPLEMENT
  ↓
TEST
  ↓
VERIFY
  ↓
AUDIT AGAIN
  ↓
REPORT
```

This is the required implementation methodology for this task.
