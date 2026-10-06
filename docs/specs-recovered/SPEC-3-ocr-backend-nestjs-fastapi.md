# COSMOZ — MASTER IMPLEMENTATION PROMPT

# OCR & TRADE SCREENSHOT RECOGNITION V1

## NestJS Orchestration + FastAPI Deterministic OCR Microservice

---

# 0. ROLE

You are the senior backend engineer responsible for implementing the **OCR & Trade Screenshot Recognition V1** feature in the existing COSMOZ codebase.

You are working inside an existing production-oriented SaaS architecture.

You are NOT starting a new project.

You must first understand the repository, its existing architecture, existing frontend implementation, existing backend modules, existing storage/job infrastructure, existing trading domain, and existing Python/FastAPI setup before modifying anything.

Your implementation must preserve the existing COSMOZ architecture.

---

# 1. ABSOLUTE PRIORITY

The implementation must follow this sequence:

```text
AUDIT
  ↓
DISCOVERY
  ↓
DEPENDENCY VERIFICATION
  ↓
ARCHITECTURAL VALIDATION
  ↓
IMPLEMENTATION PLAN
  ↓
SMALL INCREMENTAL IMPLEMENTATION
  ↓
TESTING
  ↓
SECURITY VERIFICATION
  ↓
INTEGRATION VERIFICATION
  ↓
RUNTIME VERIFICATION
  ↓
FINAL REPORT
  ↓
STOP
```

DO NOT start by writing code.

DO NOT start by installing packages.

DO NOT assume FastAPI is missing.

DO NOT assume Python dependencies are missing.

DO NOT recreate the frontend.

DO NOT create a second OCR architecture if one already exists.

---

# 2. PROJECT CONTEXT

COSMOZ currently follows this architecture:

```text
COSMOZ
│
├── Frontend
│   └── Next.js
│
├── Backend
│   └── NestJS
│       └── DDD Modular Monolith
│
├── Database
│   └── PostgreSQL
│       └── Prisma
│
├── Shared Contracts
│   └── @cosmoz/shared
│       └── Zod
│
└── Specialized Microservice
    └── FastAPI / Python
```

The OCR feature is a specialized capability and belongs to the FastAPI/Python boundary.

The frontend already exists.

The frontend must be treated as an existing product surface and integration contract.

---

# 3. CURRENT FEATURE OBJECTIVE

Implement:

# OCR & Trade Screenshot Recognition V1

The feature allows a user to upload a trading screenshot and extract structured trading information.

Target pipeline:

```text
Trading Screenshot
        ↓
Image Validation
        ↓
Preprocessing
        ↓
Platform / Screenshot Classification
        ↓
OCR
        ↓
Region / Layout Analysis
        ↓
Trading Field Extraction
        ↓
Normalization
        ↓
Cross-Field Validation
        ↓
Deterministic Confidence
        ↓
RecognitionResult
        ↓
NestJS
        ↓
Trade Draft
        ↓
Frontend Review
        ↓
User Correction
        ↓
User Confirmation
        ↓
Trading Core
        ↓
Canonical Trade
```

---

# 4. NON-NEGOTIABLE PRODUCT CONSTRAINTS

## 4.1 NO MACHINE LEARNING

V1 must NOT implement machine-learning-based recognition.

Forbidden:

```text
YOLO
Object Detection Models
Neural Networks
Deep Learning
Transformers
Custom ML Models
Model Training
Fine-Tuning
Embeddings
Vector Databases
```

Use deterministic techniques only.

Allowed:

```text
OCR Engine
OpenCV
Pillow
NumPy
Image preprocessing
Template matching where deterministic
Regex
Pattern matching
Spatial analysis
Known UI labels
Known platform signatures
Deterministic scoring
Deterministic validation
```

---

# 5. NO LLM / NO VLM

Absolutely forbidden:

```text
GPT
Claude
Gemini
Llama
VLM
Multimodal LLM
LLM extraction
AI agent
AI vision model
AI-powered parser
```

The feature must work without any external AI provider.

Do not add OpenAI, Anthropic, Gemini, or similar dependencies.

Do not add API keys for AI services.

---

# 6. HUMAN-IN-THE-LOOP IS MANDATORY

OCR output is NEVER authoritative.

Required lifecycle:

```text
Recognition
    ↓
Recognition Result
    ↓
Trade Draft
    ↓
User Review
    ↓
User Correction
    ↓
User Confirmation
    ↓
Canonical Trade
```

Forbidden:

```text
Screenshot
    ↓
OCR
    ↓
Automatic Trade
```

A screenshot must never automatically create an authoritative Trade merely because OCR completed successfully.

---

# 7. FRONTEND IS ALREADY IMPLEMENTED

IMPORTANT:

The Next.js frontend for this feature has already been implemented.

DO NOT rebuild it.

DO NOT redesign it.

DO NOT replace it.

DO NOT create a second OCR UI.

DO NOT introduce new frontend architecture unless an actual backend incompatibility requires a minimal compatibility adjustment.

First audit the existing frontend implementation.

Determine:

```text
routes
components
hooks
state management
API calls
types
expected response structures
job states
upload behavior
review fields
confirmation flow
error states
loading states
```

The backend implementation must adapt to the existing frontend where reasonable.

If the frontend contains inconsistencies, document them first.

Only make frontend changes when strictly necessary for backend integration.

---

# 8. PHASE 0 — REPOSITORY AUDIT

Before modifying any file, inspect the repository.

Read all applicable repository instructions.

Inspect:

```text
README
AGENTS.md
CONTRIBUTING.md
package.json
pnpm-lock.yaml / package-lock.json / yarn.lock
tsconfig
NestJS configuration
Prisma configuration
Docker configuration
docker-compose
CI configuration
environment examples
Python configuration
FastAPI configuration
requirements.txt
requirements-dev.txt
pyproject.toml
poetry.lock
uv.lock
Pipfile
Pipfile.lock
Dockerfiles
```

Use the package manager and tooling already established by the repository.

Do not introduce a second package manager without justification.

---

# 9. CHECK GIT STATE FIRST

Before modifications:

```bash
git status
git diff
git branch
```

Understand existing user changes.

NEVER overwrite unrelated work.

NEVER reset the repository.

NEVER discard user changes.

NEVER run destructive cleanup commands without explicit authorization.

---

# 10. AUDIT THE EXISTING FRONTEND OCR FEATURE

Locate the existing OCR feature.

Inspect:

```text
OCR pages
OCR components
upload components
recognition components
review forms
confirmation UI
API clients
types
schemas
loading states
error states
status handling
```

Document:

```text
Expected request
Expected response
Expected fields
Expected status lifecycle
Expected errors
Expected confirmation behavior
```

The frontend is already finished, so use it as a primary source of truth for the API contract.

---

# 11. CRITICAL: VERIFY FASTAPI BEFORE INSTALLING ANYTHING

Before installing ANY Python dependency, perform a complete dependency audit.

Search the repository for:

```text
fastapi
uvicorn
pydantic
opencv
cv2
Pillow
numpy
pytesseract
easyocr
tesseract
ocr
```

Also inspect:

```text
requirements.txt
requirements-dev.txt
pyproject.toml
poetry.lock
uv.lock
Pipfile
Dockerfile
docker-compose.yml
```

Determine whether FastAPI is already installed.

Determine whether Python is already configured.

Determine the supported Python version.

Determine whether a Python virtual environment already exists.

Determine whether the repository already contains:

```text
services/
ocr-service/
python/
fastapi/
microservices/
```

or an equivalent structure.

---

# 12. FASTAPI DEPENDENCY AUDIT REPORT

Before implementing, explicitly determine:

```text
Python version:
FastAPI installed: YES / NO
FastAPI version:
Uvicorn installed: YES / NO
Pydantic installed: YES / NO
Pillow installed: YES / NO
NumPy installed: YES / NO
OpenCV installed: YES / NO
OCR engine installed: YES / NO
OCR Python binding installed: YES / NO
Existing OCR service: YES / NO
Existing Docker configuration: YES / NO
Existing Python test framework: YES / NO
Existing lint/type-check tooling: YES / NO
```

Also determine whether OCR requires a system-level dependency.

For example, if using Tesseract:

```text
Python package ≠ Tesseract binary
```

Verify both separately.

Do not assume installing `pytesseract` installs the Tesseract executable.

---

# 13. DEPENDENCY INSTALLATION RULE

Only install dependencies that are genuinely required.

Follow this decision tree:

```text
Is FastAPI already installed?
        │
        ├── YES → reuse it
        │
        └── NO → determine whether FastAPI is required
                    ↓
                  install only if justified
```

For each dependency:

```text
Already installed?
       ↓
Can existing dependency perform the requirement?
       ↓
If yes → reuse
       ↓
If no → determine minimum required dependency
```

Do NOT install packages merely because they are common in OCR projects.

Do NOT install ML packages.

Do NOT install LLM packages.

Do NOT install unnecessary vision frameworks.

---

# 14. PREFERRED V1 OCR STACK

The preferred deterministic stack is:

```text
Python
FastAPI
Pydantic
Pillow
NumPy
OpenCV
Deterministic OCR engine
```

Potential OCR engine:

```text
Tesseract
```

or an equivalent deterministic OCR engine already present in the repository.

The actual choice must be based on the audit.

If the repository already has a working OCR engine, reuse it.

Do not replace a working implementation without evidence.

---

# 15. SYSTEM DEPENDENCY VERIFICATION

If the selected OCR engine requires a system binary, verify it explicitly.

Example:

```bash
tesseract --version
```

Do not claim OCR is operational merely because:

```python
import pytesseract
```

works.

The complete runtime dependency must be verified.

---

# 16. PYTHON ENVIRONMENT

Inspect the current Python environment.

Determine:

```text
Python executable
Python version
virtual environment
dependency manager
lockfile
```

Prefer the project's existing Python workflow.

Do not create a second Python environment if the repository already has one.

---

# 17. DO NOT INSTALL BEFORE AUDIT

This is a mandatory rule.

The first implementation phase must be:

```text
DISCOVERY ONLY
```

No dependency installation.

No migration.

No code generation.

No schema modification.

No package update.

No Docker modification.

Only after the audit and implementation plan are complete may implementation begin.

---

# 18. AUDIT NESTJS ARCHITECTURE

Inspect:

```text
src/
modules/
contexts/
domain/
application/
infrastructure/
controllers/
services/
repositories/
guards/
pipes/
interceptors/
events/
queues/
jobs/
websockets/
storage/
```

Determine where OCR belongs.

Expected architectural boundary:

```text
OCR / Recognition bounded context
```

Reuse the repository's existing conventions.

---

# 19. AUDIT TRADING CORE

Before implementing OCR integration, inspect the existing Trading Core.

Find:

```text
Trade
TradeExecution
Trade creation use case
Trade import
External trade mapping
P&L
fees
commission
swap
account association
ownership
duplicate detection
```

Determine how a canonical Trade is created.

OCR MUST reuse the existing Trade creation/import mechanism.

Never create a second Trade model.

---

# 20. AUDIT TRADE IMPORT

Search for existing:

```text
CSV import
manual trade import
broker import
external trade ingestion
trade mapper
trade factory
trade application service
```

If an import pipeline exists:

```text
OCR
 ↓
Common Trade Import Pipeline
 ↓
Trading Core
```

is preferred.

Do not implement a separate OCR-specific Trade creation pipeline if an equivalent canonical import mechanism already exists.

---

# 21. AUDIT STORAGE

Find the existing file storage abstraction.

Possible implementations:

```text
local storage
S3
Cloudinary
Vercel Blob
MinIO
object storage
filesystem
```

Reuse it.

Do not create an OCR-specific storage system.

---

# 22. AUDIT QUEUE / JOB INFRASTRUCTURE

Search for:

```text
BullMQ
Redis
queues
workers
cron
background jobs
job processors
async task infrastructure
```

If one exists, reuse it.

Do not create a second queue system.

---

# 23. AUDIT MONITORING

Reuse:

```text
logging
metrics
health checks
correlation IDs
monitoring
error reporting
```

Do not create a second observability infrastructure.

---

# 24. AUDIT SECURITY

Reuse:

```text
authentication
JWT
Guards
Policies
RBAC
ownership checks
rate limiting
audit logging
```

Do not create a second authorization mechanism.

---

# 25. AUDIT SHARED CONTRACTS

Inspect:

```text
@cosmoz/shared
Zod schemas
API types
DTOs
generated types
```

Determine whether OCR contracts already exist.

If they do:

```text
reuse / extend
```

Do not create duplicate definitions.

---

# 26. ARCHITECTURAL DECISION

After the audit, produce a concise internal architecture map:

```text
Existing OCR:
Existing FastAPI:
Existing Python dependencies:
Existing storage:
Existing queue:
Existing monitoring:
Existing shared contracts:
Existing trade import:
Existing Trade creation:
Existing frontend API contract:
```

Then determine the smallest implementation surface.

---

# 27. FINAL TARGET ARCHITECTURE

Unless the audit proves an existing equivalent architecture, target:

```text
NEXT.JS
   │
   │ HTTPS
   ▼
NESTJS
   │
   ├── Authentication
   ├── Authorization
   ├── OCR orchestration
   ├── OCR jobs
   ├── Recognition persistence
   ├── Trade Draft
   ├── User confirmation
   └── Trading Core integration
            │
            ▼
        PostgreSQL
            │
          Prisma

NESTJS
   │
   │ Internal authenticated service request
   ▼
FASTAPI
   │
   ├── Image validation
   ├── Preprocessing
   ├── OCR
   ├── Platform detection
   ├── Region analysis
   ├── Field extraction
   ├── Normalization
   ├── Validation
   └── Deterministic confidence
```

---

# 28. FASTAPI RESPONSIBILITY

FastAPI answers:

> What information does this image appear to contain?

FastAPI owns:

```text
image processing
OCR
layout analysis
platform recognition
field extraction
normalization
deterministic confidence
recognition result
```

---

# 29. NESTJS RESPONSIBILITY

NestJS answers:

> Is this valid for the authenticated Cosmoz user and how does it enter the domain?

NestJS owns:

```text
authentication
authorization
ownership
OCR job lifecycle
service orchestration
persistence
trade draft
confirmation
Trading Core integration
audit
API contracts
```

---

# 30. FASTAPI MUST NOT OWN

FastAPI must NOT own:

```text
Users
Authentication
JWT
Cosmoz permissions
Trading Accounts
Canonical Trades
Trade Execution
Journal
Playbook
Analytics
Settings
Security
Monitoring
```

---

# 31. FASTAPI MUST NOT ACCESS POSTGRESQL

Unless the audit reveals a very specific existing architectural reason, FastAPI must remain stateless from the Cosmoz business-database perspective.

Forbidden:

```text
FastAPI
   ↓
Prisma
```

and:

```text
FastAPI
   ↓
PostgreSQL
```

for Cosmoz domain persistence.

---

# 32. OCR DOMAIN MODEL

Implement only the models actually required by the frontend and workflow.

Potential concepts:

```text
OCRJob
RecognitionResult
RecognitionField
RecognitionIssue
RecognitionRegion
TradeDraft
```

Do not create unnecessary entities.

---

# 33. OCR JOB STATES

Support the lifecycle required by the frontend.

Possible states:

```text
PENDING
PROCESSING
COMPLETED
FAILED
CANCELLED
```

If the existing frontend uses different states, adapt to it.

---

# 34. OCR JOB OWNERSHIP

Every OCR job must belong to an authenticated user.

Potential relationship:

```text
User
  │
  └── OCRJob
```

All access must verify ownership.

---

# 35. OCR RESULT OWNERSHIP

Recognition results must never be globally readable.

Verify:

```text
userId
ownership
authorization
```

on every relevant operation.

---

# 36. UPLOAD SECURITY

Validate:

```text
MIME type
extension
file size
image dimensions
image readability
```

Reject unsupported formats.

Do not trust client-provided MIME type.

Do not trust filenames.

---

# 37. IMAGE RESOURCE PROTECTION

Protect against:

```text
huge images
decompression bombs
malformed images
memory exhaustion
CPU exhaustion
extremely large dimensions
```

Define explicit limits.

---

# 38. FASTAPI IMAGE VALIDATION

FastAPI must independently validate the image it receives.

NestJS validation is not sufficient.

FastAPI should not blindly trust upstream input.

---

# 39. PREPROCESSING

Implement deterministic preprocessing only where useful:

```text
resize
grayscale
contrast
denoise
sharpen
threshold
deskew
rotation
crop
```

Do not blindly apply every operation.

The pipeline should choose preprocessing paths deterministically.

---

# 40. OCR ENGINE

Use the OCR engine identified during the dependency audit.

If Tesseract is selected:

verify:

```text
Python binding
Tesseract executable
language packs
runtime accessibility
```

Do not silently assume they exist.

---

# 41. OCR LANGUAGE

Determine supported OCR languages from actual product requirements and screenshots.

Do not install unnecessary language packs.

If trading screenshots are predominantly English, support English first.

If multilingual labels are actually required by the existing frontend/product, implement the necessary languages.

---

# 42. PLATFORM DETECTION

Implement deterministic platform recognition.

Potential platforms:

```text
MT5
MT4
TradingView
cTrader
UNKNOWN
```

Only implement platforms supported by actual product requirements or existing frontend behavior.

Use:

```text
known labels
known terminology
layout signatures
field labels
platform-specific vocabulary
```

No ML.

---

# 43. RECOGNIZER ABSTRACTION

Create an extensible deterministic abstraction.

Conceptually:

```python
class PlatformRecognizer:
    def supports(...)
    def recognize(...)
```

Possible implementations:

```text
MT5Recognizer
TradingViewRecognizer
CTraderRecognizer
GenericRecognizer
```

Do not overengineer if only one platform is required in V1.

---

# 44. GENERIC FALLBACK

If no known platform is identified:

```text
platform = UNKNOWN
```

The system may attempt generic OCR extraction.

It must not fabricate a platform.

---

# 45. OCR RAW OUTPUT

Keep raw OCR conceptually separate from structured extraction.

Pipeline:

```text
Raw OCR
   ↓
Structured Extraction
```

Do not mix parsing and OCR engine internals.

---

# 46. REGION DATA

Where supported by the OCR engine, preserve bounding boxes.

Example:

```json
{
  "text": "XAUUSD",
  "bbox": {
    "x": 120,
    "y": 240,
    "width": 150,
    "height": 30
  }
}
```

Use these regions for deterministic spatial matching.

---

# 47. FIELD EXTRACTION

Extract only relevant trading fields.

Potential fields:

```text
symbol
direction
volume
entryPrice
exitPrice
stopLoss
takeProfit
profitLoss
commission
swap
openTime
closeTime
tradeId
orderId
accountIdentifier
currency
```

The final list must be based on:

```text
existing frontend
Trading Core
Trade creation contract
```

Do not add fields merely because they are theoretically useful.

---

# 48. FIELD ALIASES

Support deterministic aliases.

Examples:

```text
BUY → LONG
SELL → SHORT

Volume → volume
Lots → volume

Open Price → entryPrice
Entry → entryPrice

SL → stopLoss
Stop Loss → stopLoss

TP → takeProfit
Take Profit → takeProfit
```

The exact mapping must be explicit and tested.

---

# 49. NUMBER PARSING

Implement safe deterministic number parsing.

Support relevant formats such as:

```text
2645.32
2645,32
2,645.32
```

only when the locale/context makes the interpretation unambiguous.

Never silently guess ambiguous numeric formats.

---

# 50. SYMBOL NORMALIZATION

Maintain:

```text
rawSymbol
normalizedSymbol
```

Do not invent symbols.

Potential mappings:

```text
XAUUSD
GOLD
XAU/USD
```

must only be normalized if the mapping is explicitly supported.

---

# 51. DIRECTION NORMALIZATION

Normalize:

```text
BUY → LONG
SELL → SHORT
LONG → LONG
SHORT → SHORT
```

Unknown:

```text
UNKNOWN
```

---

# 52. PRICE VALIDATION

Validate extracted prices.

For LONG:

```text
stopLoss < entryPrice
takeProfit > entryPrice
```

For SHORT:

```text
stopLoss > entryPrice
takeProfit < entryPrice
```

If inconsistent:

```text
RecognitionIssue
```

Do not silently correct the values.

---

# 53. VOLUME VALIDATION

Require:

```text
volume > 0
```

If account/instrument metadata is available through NestJS, validation may also use:

```text
minimum volume
maximum volume
volume step
```

Do not duplicate broker specifications in FastAPI.

---

# 54. TIMESTAMP HANDLING

Do not invent dates or timezones.

If the screenshot only contains:

```text
14:32
```

do not invent a date.

Return an ambiguity issue if necessary.

---

# 55. P&L

Treat extracted P&L as OCR-derived data.

If enough fields are available, Cosmoz may independently validate the relationship.

Do not silently replace OCR P&L with a calculated value.

---

# 56. CROSS-FIELD VALIDATION

Validate relationships between fields.

Examples:

```text
LONG + SL below entry = valid
LONG + SL above entry = invalid

SHORT + SL above entry = valid
SHORT + SL below entry = invalid
```

Also validate:

```text
TP
entry
SL
volume
timestamps
```

where applicable.

---

# 57. DETERMINISTIC CONFIDENCE

Implement a transparent confidence mechanism.

Confidence may consider:

```text
OCR quality
field recognition
label proximity
pattern match
numeric parsing
cross-field consistency
platform recognition
ambiguity
duplicate/conflicting values
```

No ML probability.

Every score must have an understandable deterministic basis.

---

# 58. FIELD-LEVEL CONFIDENCE

Prefer:

```text
symbolConfidence
directionConfidence
volumeConfidence
entryConfidence
stopLossConfidence
takeProfitConfidence
profitLossConfidence
openTimeConfidence
closeTimeConfidence
```

where useful.

---

# 59. OVERALL CONFIDENCE

If implemented, derive the overall score from actual field-level evidence.

Do not use arbitrary:

```text
0.95
```

because the parser "looks good".

Document the scoring method.

---

# 60. RECOGNITION ISSUES

Support structured issues such as:

```text
LOW_OCR_CONFIDENCE
UNKNOWN_PLATFORM
UNKNOWN_SYMBOL
AMBIGUOUS_DIRECTION
AMBIGUOUS_NUMBER
INVALID_PRICE_RELATIONSHIP
MISSING_REQUIRED_FIELD
INVALID_TIMESTAMP
CONFLICTING_FIELDS
UNSUPPORTED_SCREENSHOT
```

Use stable machine-readable codes.

---

# 61. RECOGNITION RESULT CONTRACT

The contract should conceptually contain:

```text
jobId
contractVersion
recognizerVersion
platform
platformConfidence
fields
regions
issues
overallConfidence
status
```

Adapt the actual schema to the existing frontend.

---

# 62. NESTJS ↔ FASTAPI CONTRACT

Define an explicit internal contract.

Potential structures:

```text
RecognitionRequest
RecognitionResponse
RecognitionField
RecognitionRegion
RecognitionIssue
```

The contract must be validated.

Do not rely on untyped arbitrary JSON.

---

# 63. CONTRACT VALIDATION

NestJS must validate the FastAPI response.

Do not trust an internal service merely because it is internal.

Use:

```text
Zod
DTO validation
schema validation
```

according to existing COSMOZ conventions.

---

# 64. CONTRACT VERSION

If appropriate, include:

```text
contractVersion
```

Example:

```text
recognition.v1
```

This becomes especially important if recognition results are persisted.

---

# 65. FASTAPI INTERNAL SECURITY

FastAPI must not be publicly callable without authorization.

Use the existing service-to-service security mechanism if one exists.

Potential:

```text
internal API key
service token
private network
mTLS
```

Do not invent unnecessary infrastructure.

---

# 66. NESTJS OCR ORCHESTRATION

NestJS should orchestrate:

```text
create job
validate upload
store image
invoke FastAPI
receive result
validate result
persist result
update job
```

Use the existing job architecture where available.

---

# 67. ASYNCHRONOUS DESIGN

If OCR can exceed normal request latency, use the existing background job system.

Preferred conceptual flow:

```text
Upload
 ↓
Create OCRJob
 ↓
Queue
 ↓
Worker
 ↓
FastAPI
 ↓
RecognitionResult
 ↓
Persist
 ↓
Frontend polls/subscribes
```

Do not create a new queue framework if one exists.

---

# 68. IDEMPOTENCY

Prevent accidental duplicate processing.

Possible mechanisms:

```text
requestId
jobId
content hash
idempotency key
```

Use the mechanism compatible with the existing architecture.

---

# 69. RETRIES

Retry only transient failures:

```text
timeout
network error
service unavailable
temporary dependency failure
```

Do not retry:

```text
invalid image
unsupported format
invalid request
deterministic parser error
```

---

# 70. TIMEOUTS

All NestJS → FastAPI requests must have bounded timeouts.

Never allow indefinite requests.

---

# 71. CANCELLATION

If the existing job system supports cancellation:

```text
CANCELLED
```

must prevent a late recognition response from creating a Trade.

---

# 72. TRADE DRAFT

Recognition output must be converted into a Trade Draft where appropriate.

Conceptually:

```text
RecognitionResult
        ↓
TradeDraft
```

The Trade Draft is not authoritative.

---

# 73. TRADE DRAFT OWNERSHIP

The draft must belong to the authenticated user.

Protect against:

```text
IDOR
forged userId
forged accountId
forged draftId
```

---

# 74. USER CORRECTION

The frontend already supports review/correction.

The backend must accept corrected values through a validated contract.

Do not trust client-provided fields blindly.

Revalidate all important fields server-side.

---

# 75. CONFIRMATION

Only explicit user confirmation may trigger Trade creation.

Example:

```text
POST /ocr/.../confirm
```

or whatever endpoint matches the existing frontend.

The exact endpoint must be derived from the frontend audit.

---

# 76. SERVER-SIDE CONFIRMATION VALIDATION

On confirmation:

```text
authenticate
 ↓
authorize
 ↓
load draft
 ↓
validate ownership
 ↓
validate fields
 ↓
validate account
 ↓
validate trading rules
 ↓
check duplicate
 ↓
create Trade through Trading Core
```

Never directly insert a Trade from the controller.

---

# 77. TRADING CORE INTEGRATION

Use the canonical existing Trading Core application service/use case.

Do NOT create:

```text
OCRTradeService
```

that duplicates Trading Core logic.

Instead:

```text
OCR
 ↓
TradeDraft
 ↓
Trading Core
```

---

# 78. NO DIRECT PRISMA TRADE CREATION FROM OCR

Forbidden:

```typescript
prisma.trade.create(...)
```

inside OCR application logic.

Trading Core owns Trade persistence.

---

# 79. DUPLICATE DETECTION

Reuse existing Trade/external activity deduplication.

Potential identifiers:

```text
provider
account
externalTradeId
externalOrderId
symbol
timestamp
```

Do not implement a competing duplicate detection algorithm if one already exists.

---

# 80. EXTERNAL IDENTIFIERS

If OCR recognizes:

```text
ticket
deal ID
order ID
position ID
```

these remain external identifiers.

They must not be confused with:

```text
Cosmoz Trade ID
```

---

# 81. ACCOUNT ASSOCIATION

If the user selects an account:

NestJS must verify:

```text
account belongs to authenticated user
account is valid
account is active/usable where required
```

Do not trust the screenshot's account number as proof of ownership.

---

# 82. OCR DATA PROVENANCE

Important fields should preserve provenance where supported:

```text
OCR
SYSTEM_NORMALIZED
USER_CORRECTED
DERIVED
USER_CONFIRMED
```

This allows Cosmoz to know what was actually recognized versus changed by the user.

---

# 83. AUDIT LOGGING

Reuse the existing audit infrastructure.

Log meaningful events:

```text
OCR_JOB_CREATED
OCR_JOB_COMPLETED
OCR_JOB_FAILED
RECOGNITION_REVIEWED
RECOGNITION_CORRECTED
TRADE_DRAFT_CREATED
TRADE_IMPORTED
```

Do not log the raw screenshot.

Do not log secrets.

Do not log sensitive values unnecessarily.

---

# 84. PRIVACY

Screenshots may contain:

```text
account number
balance
equity
broker
financial information
personal information
```

Treat them as private user data.

Do not expose them in logs, analytics, or public URLs.

---

# 85. FILE NAMING

Never trust the uploaded filename.

Use server-generated identifiers.

Never construct filesystem paths directly from user input.

Protect against path traversal.

---

# 86. XSS

OCR text is untrusted.

Do not interpret OCR output as HTML.

A screenshot containing:

```text
<script>alert(...)</script>
```

must remain text.

---

# 87. ARBITRARY EXECUTION

Never execute user-supplied:

```text
Python
JavaScript
SQL
Shell
Regex code
```

Extraction rules must be application-defined.

---

# 88. RATE LIMITING

OCR can be computationally expensive.

Reuse existing rate-limiting infrastructure.

Define reasonable limits for:

```text
uploads
jobs
processing frequency
concurrent processing
```

Do not create an independent rate-limit system.

---

# 89. MONITORING

Integrate OCR into existing Monitoring.

Useful metrics:

```text
ocr_jobs_total
ocr_jobs_completed
ocr_jobs_failed
ocr_processing_duration
ocr_failure_rate
fastapi_latency
fastapi_errors
```

If confidence metrics are safe and useful:

```text
recognition_confidence_distribution
```

---

# 90. FASTAPI HEALTH

Implement health/readiness endpoints according to repository conventions.

Verify:

```text
FastAPI available
OCR engine available
required runtime dependencies available
```

---

# 91. ERROR HANDLING

Use stable error codes.

Examples:

```text
INVALID_IMAGE
UNSUPPORTED_FORMAT
IMAGE_TOO_LARGE
IMAGE_UNREADABLE
OCR_UNAVAILABLE
OCR_TIMEOUT
RECOGNITION_FAILED
UNSUPPORTED_SCREENSHOT
LOW_CONFIDENCE
```

Do not expose internal Python stack traces to users.

---

# 92. ERROR BOUNDARY

FastAPI internal exception:

```text
Python exception
```

must become:

```text
structured service error
```

NestJS must map that into the existing COSMOZ API error format.

---

# 93. LOGGING FASTAPI

Log:

```text
jobId
requestId
processing duration
recognizer version
status
error code
```

Do not log:

```text
full image
raw sensitive screenshot
credentials
tokens
secrets
```

---

# 94. DETERMINISM

The same:

```text
screenshot
+
recognizer version
+
configuration
```

should produce the same recognition result.

Avoid randomness.

---

# 95. RECOGNIZER VERSIONING

If useful for persisted results, introduce:

```text
recognizerVersion
```

Examples:

```text
mt5-v1
generic-v1
tradingview-v1
```

This enables reproducibility.

---

# 96. TEST FIXTURES

Create a deterministic OCR test corpus.

Use anonymized or synthetic screenshots.

Include:

```text
MT5 screenshots
TradingView screenshots
supported platform screenshots
unknown screenshots
dark mode
light mode
different resolutions
compressed images
low-quality images
partial screenshots
ambiguous screenshots
```

Do not commit private user screenshots.

---

# 97. UNIT TESTS — FASTAPI

Test:

```text
image validation
preprocessing
OCR parsing
platform detection
symbol extraction
direction extraction
volume extraction
price extraction
SL extraction
TP extraction
P&L extraction
timestamp extraction
normalization
confidence
cross-field validation
```

---

# 98. UNIT TESTS — NESTJS

Test:

```text
OCR job creation
authorization
ownership
service invocation
response validation
job state transitions
result persistence
draft creation
confirmation
duplicate detection
error handling
```

---

# 99. CONTRACT TESTS

Verify:

```text
NestJS request
        ↓
FastAPI
        ↓
FastAPI response
        ↓
NestJS schema validation
```

No undocumented fields should be relied upon.

---

# 100. SECURITY TESTS

Mandatory negative tests:

```text
Unauthenticated OCR upload → DENIED

User A reads User B job → DENIED

User A reads User B result → DENIED

User A edits User B draft → DENIED

User A confirms User B draft → DENIED

Forged accountId → DENIED

FastAPI unauthenticated internal call → DENIED

Invalid MIME → DENIED

Oversized image → DENIED

Malformed image → DENIED

Cancelled job creates Trade → DENIED

Unconfirmed recognition creates Trade → DENIED
```

---

# 101. TRADING SAFETY TESTS

Prove that OCR cannot:

```text
place orders
modify orders
cancel orders
close positions
modify SL
modify TP
```

The feature is strictly an import/recognition mechanism.

---

# 102. CONFIRMATION TEST

Mandatory:

```text
RecognitionResult
        ↓
NO confirmation
        ↓
NO Trade
```

Then:

```text
RecognitionResult
        ↓
User correction
        ↓
User confirmation
        ↓
Trade
```

---

# 103. CROSS-FIELD TESTS

Examples:

```text
LONG + SL above Entry
→ invalid

LONG + TP below Entry
→ invalid

SHORT + SL below Entry
→ invalid

SHORT + TP above Entry
→ invalid
```

The implementation must not silently modify the values.

---

# 104. NUMERIC TESTS

Test:

```text
2645.32
2645,32
2,645.32
negative P&L
positive P&L
zero P&L
small decimal values
large numeric values
```

---

# 105. DATE TESTS

Test supported formats and ambiguity.

Never invent:

```text
missing date
missing timezone
ambiguous date
```

---

# 106. REGRESSION TESTS

Every bug found during implementation must receive a regression test when practical.

Do not fix OCR parsing regressions without preserving the failing case.

---

# 107. END-TO-END TEST

At least one complete deterministic workflow must be verified:

```text
Upload screenshot
      ↓
Create OCR job
      ↓
FastAPI processing
      ↓
Recognition result
      ↓
Trade draft
      ↓
Review
      ↓
Correction
      ↓
Confirmation
      ↓
Canonical Trade
```

---

# 108. FRONTEND INTEGRATION VERIFICATION

Verify the existing Next.js frontend against the actual backend.

Check:

```text
upload
loading
job status
result rendering
field mapping
confidence
errors
correction
confirmation
success state
```

Do not assume TypeScript types match the backend.

Actually verify.

---

# 109. DATABASE MIGRATIONS

If OCR requires persistence:

```text
Create migration
Review migration
Apply migration to clean database
Apply migration to existing development database
Verify indexes
Verify foreign keys
Verify constraints
```

Do not modify existing tables unnecessarily.

---

# 110. DATABASE DESIGN

Keep OCR data normalized.

Avoid creating one giant JSON object containing everything.

JSON may be used for flexible raw recognition data where justified.

Core business fields should remain queryable.

---

# 111. PRISMA BOUNDARY

Prisma remains infrastructure.

Architecture:

```text
Controller
 ↓
Application
 ↓
Domain
 ↓
Repository interface
 ↓
Prisma implementation
```

Do not expose Prisma models directly to frontend.

---

# 112. CONTROLLER RULE

Controllers should only:

```text
authenticate
authorize
validate
map
invoke
respond
```

No OCR parsing inside controllers.

No Trade business logic inside controllers.

---

# 113. APPLICATION SERVICE RULE

Application services orchestrate use cases.

Avoid creating a giant:

```text
OcrEverythingService
```

containing:

```text
upload
OCR
storage
Trade creation
analytics
audit
```

Separate responsibilities.

---

# 114. DOMAIN RULE

Domain logic must not depend on:

```text
HTTP
NestJS controllers
Prisma
FastAPI
filesystem
external APIs
```

Use interfaces/adapters.

---

# 115. FASTAPI STRUCTURE

If no existing Python structure exists, use a maintainable structure similar to:

```text
services/
└── ocr-service/
    ├── app/
    │   ├── main.py
    │   ├── api/
    │   │   ├── routes/
    │   │   │   ├── health.py
    │   │   │   └── recognition.py
    │   │   └── dependencies.py
    │   │
    │   ├── application/
    │   │   ├── services/
    │   │   ├── use_cases/
    │   │   └── dto/
    │   │
    │   ├── domain/
    │   │   ├── entities/
    │   │   ├── value_objects/
    │   │   └── services/
    │   │
    │   ├── infrastructure/
    │   │   ├── ocr/
    │   │   ├── preprocessing/
    │   │   ├── recognition/
    │   │   └── templates/
    │   │
    │   └── config/
    │
    └── tests/
        ├── unit/
        ├── integration/
        └── fixtures/
```

BUT:

If the repository already has a Python/FastAPI structure, reuse it rather than creating this structure.

---

# 116. DO NOT OVERENGINEER FASTAPI

Do not introduce ceremonial architecture.

Use the minimum number of layers needed to keep:

```text
API
Application
Recognition domain
Infrastructure
```

properly separated.

---

# 117. DEPENDENCY MANAGEMENT

Use the repository's existing dependency manager.

Examples:

```text
uv
Poetry
pip + requirements
Pipenv
```

Do not introduce another manager unnecessarily.

Lock dependencies where the repository convention requires it.

---

# 118. DEPENDENCY MINIMIZATION

Before adding a package ask:

```text
Do we already have this capability?
Can standard Python solve it?
Can an existing dependency solve it?
Is the dependency actually required?
Does it introduce ML?
Does it introduce unnecessary runtime complexity?
```

Only then add it.

---

# 119. NO DEPENDENCY BLOAT

Do not install:

```text
torch
tensorflow
transformers
ultralytics
langchain
openai
anthropic
google-generativeai
sentence-transformers
faiss
chromadb
```

for V1.

---

# 120. DOCKER

If Docker already exists:

```text
reuse existing conventions
```

If FastAPI needs a service container:

```text
add the smallest necessary configuration
```

Do not redesign the entire Docker architecture.

---

# 121. LOCAL DEVELOPMENT

Ensure developers can run:

```text
NestJS
FastAPI
PostgreSQL
```

using the repository's established development workflow.

Document the commands.

---

# 122. ENVIRONMENT VARIABLES

Use environment configuration for:

```text
FASTAPI_URL
FASTAPI_TIMEOUT
OCR_MAX_FILE_SIZE
OCR_MAX_IMAGE_WIDTH
OCR_MAX_IMAGE_HEIGHT
OCR_MAX_PROCESSING_TIME
OCR_CONFIDENCE_THRESHOLD
```

only where actually needed.

Do not hardcode secrets.

---

# 123. NO SECRETS IN SOURCE

Never commit:

```text
API keys
service tokens
database credentials
JWT secrets
cloud credentials
OCR service credentials
```

---

# 124. PERFORMANCE

Measure:

```text
upload time
preprocessing time
OCR time
recognition time
NestJS → FastAPI latency
total processing time
```

Avoid unnecessary image copies.

Avoid repeated OCR passes unless justified.

---

# 125. CONCURRENCY

Protect FastAPI from too many simultaneous expensive OCR jobs.

Reuse existing queue/concurrency mechanisms where available.

Do not allow one user to exhaust the service.

---

# 126. FAILURE ISOLATION

FastAPI failure must not bring down NestJS.

If FastAPI is unavailable:

```text
OCR Job
→ retryable failure / service unavailable
```

Other COSMOZ functionality must continue operating.

---

# 127. GRACEFUL SHUTDOWN

Ensure:

```text
NestJS
FastAPI
workers
```

can shut down cleanly according to existing project conventions.

Do not lose jobs silently.

---

# 128. DOCUMENTATION

Update appropriate documentation.

Document:

```text
OCR architecture
FastAPI setup
Python version
dependencies
OCR engine
system dependencies
local development
environment variables
API contract
job lifecycle
recognition result
Trade Draft
confirmation
security
testing
```

---

# 129. IMPLEMENTATION ORDER

Follow this exact dependency-aware sequence.

## Step 1

Repository audit.

## Step 2

Frontend OCR audit.

## Step 3

NestJS audit.

## Step 4

Trading Core audit.

## Step 5

Trade import audit.

## Step 6

Storage audit.

## Step 7

Queue/job audit.

## Step 8

Monitoring/security audit.

## Step 9

Python/FastAPI dependency audit.

## Step 10

Verify Python runtime.

## Step 11

Verify OCR system dependency.

## Step 12

Produce implementation plan.

## Step 13

Only now install missing dependencies if genuinely necessary.

## Step 14

Implement FastAPI foundation.

## Step 15

Implement deterministic OCR pipeline.

## Step 16

Implement NestJS orchestration.

## Step 17

Implement recognition persistence.

## Step 18

Implement Trade Draft.

## Step 19

Implement confirmation.

## Step 20

Integrate Trading Core.

## Step 21

Implement security protections.

## Step 22

Implement tests.

## Step 23

Integrate existing frontend.

## Step 24

Run full verification.

---

# 130. IMPLEMENTATION STRATEGY

Use incremental vertical slices.

Example:

```text
Slice 1
Health + FastAPI connectivity

Slice 2
Image validation

Slice 3
OCR

Slice 4
Field extraction

Slice 5
Recognition result

Slice 6
NestJS persistence

Slice 7
Trade Draft

Slice 8
Confirmation

Slice 9
Trading Core

Slice 10
Security + regression hardening
```

After each slice:

```text
test
inspect
verify
```

---

# 131. DO NOT MAKE BROAD REFACTORS

Do not use this feature as an excuse to:

```text
rewrite NestJS
rewrite Trading Core
rewrite Prisma schema
rewrite frontend
replace authentication
replace storage
replace queue
replace monitoring
```

Only change existing infrastructure when required by the feature and supported by evidence.

---

# 132. DO NOT DUPLICATE EXISTING LOGIC

Before creating any service, search for an existing equivalent.

Especially:

```text
Trade creation
Trade import
P&L calculation
Risk calculation
Account ownership
File storage
Job handling
Audit logging
Authentication
Authorization
Validation
Monitoring
```

Reuse.

---

# 133. SECURITY-FIRST VERIFICATION

After implementation, explicitly test:

```text
authentication
authorization
IDOR
upload abuse
resource exhaustion
service authentication
confirmation bypass
trade creation bypass
sensitive logging
```

---

# 134. FINAL VERIFICATION

Run the broadest proportionate verification suite available.

At minimum:

```text
FastAPI unit tests
FastAPI integration tests
NestJS unit tests
NestJS integration tests
contract tests
security tests
E2E tests
TypeScript typecheck
Python typecheck if configured
lint
format validation
build
database migration validation
runtime health checks
```

Use the repository's actual commands.

Do not invent commands blindly.

---

# 135. VERIFY CLEAN INSTALL

Where practical, verify that the Python service can be installed from its declared dependency configuration in a clean environment.

Goal:

```text
fresh environment
        ↓
install declared dependencies
        ↓
start FastAPI
        ↓
OCR health check
        ↓
process fixture
```

This is important because "works on the current machine" is not sufficient.

---

# 136. VERIFY OCR ENGINE

Do not claim the feature works until an actual OCR fixture is processed.

Verify:

```text
image
 ↓
FastAPI
 ↓
OCR engine
 ↓
structured recognition result
```

with real execution.

---

# 137. VERIFY NESTJS → FASTAPI

Perform an actual integration test or runtime verification:

```text
NestJS
 ↓
authenticated internal request
 ↓
FastAPI
 ↓
RecognitionResult
 ↓
NestJS validation
```

Do not verify only mocks.

---

# 138. VERIFY COMPLETE USER FLOW

Where browser/runtime testing is available, verify:

```text
Frontend
 ↓
Upload
 ↓
NestJS
 ↓
FastAPI
 ↓
Recognition
 ↓
Frontend result
 ↓
Correction
 ↓
Confirmation
 ↓
Trade
```

The frontend already exists, so this is integration verification, not frontend development.

---

# 139. ACCEPTANCE CRITERIA

The feature is accepted only if:

```text
✓ Existing frontend remains functional
✓ FastAPI presence was audited first
✓ Python dependencies were audited first
✓ System OCR dependencies were verified
✓ Only necessary dependencies were added
✓ No ML
✓ No LLM
✓ Deterministic OCR
✓ Image validation
✓ Platform recognition
✓ Field extraction
✓ Normalization
✓ Cross-field validation
✓ Confidence scoring
✓ RecognitionResult
✓ OCR Job lifecycle
✓ Trade Draft
✓ User correction
✓ Explicit confirmation
✓ Canonical Trade integration
✓ Existing Trading Core reused
✓ Existing storage reused
✓ Existing queue reused
✓ Existing monitoring reused
✓ Existing auth reused
✓ Existing authorization reused
✓ IDOR protection
✓ Upload security
✓ Resource limits
✓ Service-to-service authentication
✓ No direct FastAPI database access
✓ No direct OCR → Prisma Trade creation
✓ Unit tests
✓ Integration tests
✓ Contract tests
✓ Security tests
✓ E2E verification
✓ Build succeeds
✓ Runtime verified
✓ Documentation updated
```

---

# 140. FINAL ARCHITECTURAL INVARIANTS

The implementation must preserve:

```text
ONE canonical Trade
ONE canonical Trading Account model
ONE canonical Trade Import mechanism
ONE canonical Storage abstraction
ONE canonical Job infrastructure
ONE canonical Authentication system
ONE canonical Authorization system
ONE canonical Audit infrastructure
ONE canonical Monitoring infrastructure
ONE NestJS backend
ONE specialized FastAPI OCR service
```

---

# 141. CRITICAL DATA FLOW

The final implementation must respect:

```text
NEXT.JS
   ↓
NESTJS
   ↓
FASTAPI
   ↓
RecognitionResult
   ↓
NESTJS
   ↓
Trade Draft
   ↓
USER CONFIRMATION
   ↓
TRADING CORE
   ↓
CANONICAL TRADE
```

Never:

```text
NEXT.JS
   ↓
FASTAPI
   ↓
DATABASE
```

Never:

```text
FASTAPI
   ↓
Trade.create()
```

Never:

```text
OCR
   ↓
automatic Trade
```

---

# 142. FINAL SECURITY INVARIANTS

The following must remain impossible:

```text
OCR bypasses authentication
OCR bypasses authorization
OCR accesses another user's data
OCR creates a Trade without confirmation
OCR executes broker actions
OCR accesses PostgreSQL directly
OCR logs screenshots
OCR exposes secrets
OCR executes arbitrary code
OCR consumes unlimited resources
```

---

# 143. FINAL REPORT

At the end, produce a detailed implementation report.

Use this structure:

```text
COSMOZ — OCR & TRADE SCREENSHOT RECOGNITION V1
IMPLEMENTATION REPORT

1. Executive Summary

2. Repository Audit

3. Existing FastAPI / Python Audit
   - Python version
   - FastAPI status
   - FastAPI version
   - Existing service
   - Existing OCR dependencies
   - Existing OCR engine
   - System dependencies
   - Package manager
   - Dependencies added
   - Dependencies intentionally not added

4. Frontend Audit
   - Existing routes
   - Existing components
   - Existing API expectations
   - Compatibility decisions

5. NestJS Architecture

6. FastAPI Architecture

7. OCR Pipeline

8. Platform Recognition

9. Field Extraction

10. Normalization

11. Validation

12. Confidence System

13. OCR Job Lifecycle

14. RecognitionResult

15. Trade Draft

16. User Confirmation

17. Trading Core Integration

18. Storage

19. Queue / Background Processing

20. Security

21. Authorization / IDOR

22. Monitoring

23. Database / Migrations

24. Tests

25. Contract Tests

26. E2E Tests

27. Runtime Verification

28. Build Verification

29. Files Changed

30. Dependencies Added

31. Issues Fixed

32. Issues Not Fixed

33. Known Limitations

34. Deferred Features

35. Verification Commands

36. Final Status
```

---

# 144. STATUS CLASSIFICATION

Use only one of:

```text
FINALIZED
```

if everything required was actually implemented and verified.

```text
NEEDS ATTENTION
```

if implementation exists but material verification or issues remain.

```text
NOT FULLY VERIFIED
```

if important verification could not be executed.

Never claim:

```text
FINALIZED
```

based only on code inspection.

---

# 145. EVIDENCE REQUIREMENT

For every major acceptance criterion, provide evidence.

Example:

```text
Requirement:
FastAPI OCR works.

Evidence:
Command executed:
pytest tests/integration/test_recognition.py

Result:
PASS
```

Do not say:

```text
OCR should work.
```

Say:

```text
OCR was executed against fixture X and produced the expected structured fields.
```

only if that was actually verified.

---

# 146. FAILURE HANDLING

If a test fails:

1. Determine whether it is:

   * implementation failure
   * test failure
   * environment failure
   * dependency failure
   * unrelated pre-existing failure

2. Fix the issue if it is within scope.

3. Rerun the relevant verification.

4. Report unresolved failures honestly.

Never:

```text
skip failing test
disable test
weaken assertion
hide failure
claim success
```

---

# 147. FINAL DIFF REVIEW

Before declaring completion:

Inspect:

```bash
git diff
git status
```

Verify:

```text
no secrets
no credentials
no unrelated changes
no generated junk
no debug prints
no accidental frontend redesign
no dependency bloat
no duplicate services
no test bypass
```

---

# 148. FINAL STOP CONDITION

Once the OCR V1 feature has been:

```text
audited
implemented
tested
secured
integrated
verified
documented
```

STOP.

Do not automatically implement:

```text
ML
LLM
VLM
AI recognition
Chart Intelligence
AI Strategy Detection
AI Trade Prediction
Behavioral AI
Backtesting
Trade Execution
```

Those are separate future phases.

---

# 149. FINAL PRINCIPLE

Always preserve this architectural responsibility:

```text
FASTAPI
"What does this image appear to contain?"

NESTJS
"Is this valid, authorized, and acceptable for Cosmoz?"

TRADING CORE
"How does this become a canonical Trade?"

NEXT.JS
"How does the user review and confirm it?"
```

The core product principle is:

```text
SCREENSHOT
    ↓
RECOGNITION
    ↓
PROPOSAL
    ↓
HUMAN REVIEW
    ↓
CONFIRMATION
    ↓
CANONICAL TRADE
```

Never:

```text
SCREENSHOT
    ↓
OCR
    ↓
AUTOMATIC TRADE
```

# END OF MASTER IMPLEMENTATION PROMPT
