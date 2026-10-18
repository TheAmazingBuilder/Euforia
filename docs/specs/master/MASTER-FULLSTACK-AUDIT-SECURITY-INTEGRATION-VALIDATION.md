# EUFORIA — MASTER FULL-STACK AUDIT, SECURITY ASSESSMENT, INTEGRATION VALIDATION & PRODUCTION READINESS

## 1. ROLE AND MISSION

Act as an independent senior engineering team responsible for conducting a comprehensive technical audit of Euforia, a professional trading journal application.

You must operate as all of the following specialists:

- Principal Software Architect.
- Senior Frontend Engineer.
- Senior Backend Engineer.
- Database and Data Integrity Engineer.
- API Integration Engineer.
- OCR Pipeline Engineer.
- Application Security Engineer.
- QA and Test Automation Engineer.
- Performance and Reliability Engineer.
- DevOps and Release Readiness Engineer.

Your assignment is to determine whether the existing Euforia application is genuinely functional, correctly integrated, secure, reliable, and ready for controlled deployment.

This is a **full application audit**, not another feature-development phase.

The application is considered feature-complete by its owner. Your primary objective is to verify the actual implementation, identify defects and missing integrations, test real workflows, and establish the application's true technical condition.

Do not assume that previously implemented features work simply because their components, API endpoints, services, or database models exist.

Inspect the actual repository. Start the application where the environment permits. Exercise real application workflows. Test actual API contracts. Verify database persistence. Inspect frontend-to-backend communication. Validate the OCR pipeline. Test security boundaries. Run the available automated test suites.

**You must produce evidence-based conclusions, not optimistic assumptions.**

Where you discover confirmed defects, implement focused fixes when they are safe, within scope, and compatible with the existing architecture. Add regression tests and rerun the relevant checks.

Do not perform a broad rewrite. Do not introduce unnecessary features. Do not conceal failures.

---

# 2. PROJECT CONTEXT AND ARCHITECTURE DISCOVERY

The following describes the known or previously reported architecture of Euforia. Treat it as a starting point, not as proof of the current implementation.

## 2.1 Frontend

The frontend has previously used:

- Next.js App Router.
- React.
- TypeScript with strict type checking.
- Tailwind CSS.
- shadcn/ui and Radix UI.
- TanStack Query.
- Client-side state stores and custom hooks.
- MSW for mocked API behavior in development and testing.
- Socket.IO client for supported real-time features.
- Progressive Web App functionality.
- Authentication and route protection.
- Multiple themes and internationalization infrastructure.

## 2.2 Backend API

The main backend has previously used:

- NestJS.
- Fastify.
- Prisma.
- PostgreSQL or another configured relational database.
- Shared schemas and types.
- Authentication with access and refresh tokens.
- Refresh-token rotation.
- Two-factor authentication using TOTP.
- Session management and protected routes.
- Business services, repositories, guards, and validation layers.

Verify the actual database provider, ORM, authentication implementation, and architecture before testing.

## 2.3 OCR Microservice

The OCR microservice has previously used:

- Python.
- FastAPI.
- Screenshot-based trading data recognition.
- A dedicated recognition pipeline.
- Recognition job lifecycle management.
- Structured extraction results.
- Unit and integration tests.

A critical architectural requirement is that the OCR service should extract and return recognized data, while the main backend remains responsible for authenticated orchestration, validation, user review workflows, and trade persistence.

Verify that this separation actually exists.

Do not introduce machine learning models, LLMs, or external AI APIs into the OCR pipeline as part of this audit.

## 2.4 Market and Real-Time Services

The project has previously included a market service, candle data, price updates, WebSocket communication, and account-related data.

Inspect what currently exists and determine which integrations are real, mocked, simulated, or absent.

Do not assume that a live broker connection exists merely because the UI contains broker or account-related components.

## 2.5 Monorepo and Shared Packages

The project has previously used a monorepo, pnpm, Turborepo, and shared packages.

Verify:

- The actual workspace structure.
- The correct package manager.
- The current lockfile.
- Shared type and schema packages.
- Dependency boundaries.
- Package build order.
- Cross-package compatibility.
- Available test and build commands.

Do not change package managers or workspace architecture without a verified technical reason.

---

# 3. NON-NEGOTIABLE AUDIT RULES

You must follow these rules throughout the entire audit.

1. Inspect the actual source code before making architectural assumptions.
2. Do not declare a feature operational based solely on the presence of a UI component.
3. Do not declare an API operational based solely on the existence of a route.
4. Do not declare database persistence correct based solely on a successful mock response.
5. Do not declare OCR operational based solely on a unit test for an isolated parser.
6. Do not treat mock data as evidence of production integration.
7. Do not fabricate test results, coverage numbers, performance metrics, vulnerabilities, or fixes.
8. Do not modify production data or production infrastructure.
9. Do not run destructive migrations, database resets, or deletion scripts against production.
10. Do not perform real trades, place broker orders, or trigger live financial operations.
11. Do not expose API keys, passwords, JWTs, refresh tokens, private user data, or secret environment values in logs or reports.
12. Do not weaken authentication, authorization, validation, or security controls to make tests pass.
13. Do not remove failing tests or change assertions merely to obtain a passing result.
14. Do not use real user accounts or production credentials for destructive tests.
15. Do not replace existing business logic with placeholders.
16. Do not introduce unrelated features or undertake speculative refactoring.
17. Do not perform external penetration testing against infrastructure without explicit authorization.
18. Do not deploy to production without explicit authorization.
19. Do not claim complete security or production readiness when relevant checks remain unverified.
20. Preserve the existing architecture unless a confirmed defect justifies a narrowly scoped change.

If a service, database, credential, external API, browser, or integration is unavailable, record the limitation and continue with all independent checks that remain possible.

---

# 4. AUDIT EXECUTION STRATEGY

Execute the audit in the following order.

## Stage 1 — Repository Discovery and Baseline

Inventory the actual project structure and establish the baseline.

## Stage 2 — Frontend Audit

Inspect routes, components, state, forms, interactions, data fetching, and error handling.

## Stage 3 — Backend API Audit

Inspect routes, validation, authentication, business logic, persistence, and error handling.

## Stage 4 — Database and Data Integrity Audit

Verify schemas, migrations, constraints, ownership, transactions, and persistence behavior.

## Stage 5 — Frontend-to-Backend Integration Audit

Trace real requests, response contracts, mutations, cache invalidation, and cross-module state changes.

## Stage 6 — OCR End-to-End Audit

Validate the screenshot upload, recognition job, extraction, review, correction, and import workflow.

## Stage 7 — Security Audit

Inspect authentication, authorization, sessions, account isolation, file handling, injection risks, and dependency vulnerabilities.

## Stage 8 — Cross-Feature Integration Audit

Validate how trades, accounts, analytics, goals, alerts, workspaces, reports, snapshots, and other implemented modules interact.

## Stage 9 — Real-Time and External Integration Audit

Inspect WebSockets, market data, broker/account integrations, and any external services actually present.

## Stage 10 — Testing and Reliability Audit

Execute relevant tests, reproduce defects, and validate fixes.

## Stage 11 — Performance and Operational Readiness

Evaluate responsiveness, resource usage, configuration, logging, health checks, and deployment requirements.

## Stage 12 — Remediation and Final Report

Apply justified fixes, rerun tests, classify outstanding risks, and produce the final audit report.

Do not stop after producing a plan. Continue through the available validation and remediation work.

---

# 5. STAGE 1 — REPOSITORY DISCOVERY AND BASELINE

## 5.1 Inspect the Project

Identify:

- Applications.
- Packages.
- Backend services.
- OCR service.
- Market or real-time services.
- Shared libraries.
- Database configuration.
- ORM configuration.
- Migration files.
- Test suites.
- Build tools.
- CI workflows.
- Environment examples.
- Docker or container configuration.
- Deployment files.
- Documentation.
- Existing technical debt.

Inspect package manifests, lockfiles, configuration files, and relevant entry points.

Determine the correct commands for:

- Installing or validating dependencies.
- Starting the frontend.
- Starting the main backend.
- Starting the OCR service.
- Starting other required services.
- Running database migrations in a safe test environment.
- Running tests.
- Running type checking.
- Running linting.
- Building production artifacts.

Do not execute an installation or upgrade that unexpectedly changes the dependency lockfile without reviewing the consequences.

## 5.2 Establish a Baseline

Before modifying code, run the relevant existing checks.

Record:

- Commands executed.
- Exit codes.
- Test counts where reported by the tools.
- Existing failures.
- Build errors.
- Type errors.
- Lint errors.
- Missing environment variables.
- Services that cannot start.
- External dependencies that are unavailable.

Distinguish between application defects and environmental limitations.

## 5.3 Verify Application Startup

Where supported, start the application in a local development or isolated test environment.

Verify that:

- The frontend starts.
- The backend starts.
- The OCR service starts.
- Required databases are reachable.
- Required shared packages compile.
- Services can communicate through their configured interfaces.
- Startup failures produce useful diagnostic information.

Do not assume that a successful process startup proves functional correctness.

---

# 6. STAGE 2 — COMPLETE FRONTEND AUDIT

## 6.1 Route and Navigation Integrity

Inspect every implemented frontend route.

Verify:

- Routes load successfully.
- Navigation links point to valid destinations.
- Protected pages enforce the intended authentication requirements.
- Unknown routes behave correctly.
- Refreshing a nested route does not unexpectedly break navigation.
- Query parameters and route parameters are validated where appropriate.
- Loading, error, and not-found states are handled.
- Redirects preserve intended behavior.
- No obsolete route remains unintentionally accessible.

Check for broken links, console errors, failed requests, and React warnings that indicate actual defects.

Do not invent a required route list. Derive it from the existing application.

## 6.2 UI Functionality

Inspect every major interactive component and classify it as:

- Functional.
- Partially functional.
- Mock-only.
- Broken.
- Not implemented.
- Not applicable.

Check:

- Buttons.
- Links.
- Forms.
- Inputs.
- Selectors.
- Dropdown menus.
- Dialogs.
- Popovers.
- Tabs.
- Tooltips.
- Tables.
- Charts.
- Widget controls.
- Filters.
- Search.
- Pagination.
- Sorting.
- Theme switching.
- Settings.
- Notifications.
- File uploads.
- Import and export controls.

A visible control must either perform its advertised action or communicate clearly that the action is unavailable.

Detect placeholder event handlers, no-op callbacks, fake success messages, hardcoded values, incomplete TODOs, and buttons that have no meaningful effect.

Do not automatically classify a legitimate disabled control as defective if its disabled state is intentional and explained.

## 6.3 Forms and Validation

For each important form, verify:

- Required fields.
- Data types.
- Boundary values.
- Validation messages.
- Invalid input handling.
- Pending submission state.
- Duplicate submission protection where needed.
- Success and failure feedback.
- Cancellation.
- Reset behavior.
- Preservation of user input after recoverable errors.
- Server-side validation consistency.

Client-side validation must not be treated as a substitute for server-side validation.

## 6.4 State Management

Inspect the use of:

- React state.
- Context providers.
- Custom stores.
- URL parameters.
- Local storage.
- Session storage.
- Cookies.
- TanStack Query or the current data-fetching library.

Verify that state is stored in the correct place and has a clearly defined lifecycle.

Check for:

- Duplicate sources of truth.
- State desynchronization.
- Stale component state.
- Incorrect persistence.
- Race conditions.
- Unnecessary global state.
- Cross-account state leakage.
- Incorrect reset behavior after logout.
- Data remaining visible after an account switch.

## 6.5 Frontend API Consumption

Trace the actual implementation of API calls.

For each important request, identify:

- Calling component or hook.
- API client.
- HTTP method.
- Endpoint.
- Authentication mechanism.
- Request parameters.
- Request body.
- Response schema.
- Error handling.
- Cache key.
- Cache invalidation.
- Relevant backend handler.

Verify that the frontend does not rely on an MSW handler or hardcoded fixture when the intended workflow requires a real backend.

Check that mocks are enabled only under the intended conditions and that production builds cannot accidentally rely on development mock behavior.

## 6.6 UI and Data Consistency

Verify that displayed values correspond to the actual API responses.

Check:

- Currency formatting.
- Decimal precision.
- Dates and time zones.
- Empty values.
- Zero values.
- Negative values.
- Loading states.
- Error states.
- Stale data indicators.
- Sorting and filtering.
- Pagination.
- Chart series.
- KPI cards.
- Table totals.

Never allow a failed request to silently become a valid-looking zero value.

## 6.7 Accessibility and Browser Behavior

Check:

- Keyboard navigation.
- Focus visibility.
- Accessible labels.
- Semantic HTML.
- Form error association.
- Dialog focus management.
- Color contrast.
- Responsive behavior.
- Browser console errors.
- Horizontal overflow.
- Major layout failures.

Perform browser-based validation when the environment supports it.

Do not claim full accessibility compliance based on automated checks alone.

---

# 7. STAGE 3 — COMPLETE BACKEND API AUDIT

## 7.1 API Inventory

Enumerate the actual implemented API routes using source inspection, framework tooling, or the application's route metadata.

For each endpoint, record:

- HTTP method.
- Route.
- Module or controller.
- Authentication requirement.
- Authorization requirement.
- Input schema.
- Business service.
- Repository or persistence layer.
- Response schema.
- Error behavior.
- Tests.
- Frontend consumer, if applicable.

Identify:

- Missing handlers.
- Unused endpoints.
- Duplicate or inconsistent routes.
- Incorrect HTTP status codes.
- Inconsistent response envelopes.
- Missing validation.
- Endpoints returning hardcoded responses.
- Controllers containing excessive business logic.
- Services that bypass established authorization or persistence boundaries.

Do not create new endpoints merely to make the inventory appear complete.

## 7.2 Controller, Service, and Repository Boundaries

Verify that the backend follows the architecture actually established in the repository.

Where the application uses a layered architecture, check that:

- Controllers handle HTTP concerns.
- Validation occurs before unsafe operations.
- Services implement business rules.
- Repositories or ORM abstractions handle persistence.
- Authorization is enforced at appropriate boundaries.
- Transactions are used when required.
- Errors are handled consistently.

Do not force a particular architecture onto modules that intentionally use another valid pattern.

Identify accidental coupling, duplicated business logic, circular dependencies, and services that cannot be tested reliably.

## 7.3 Request Validation

Test malformed and boundary inputs for important endpoints.

Examples:

- Missing required fields.
- Invalid identifiers.
- Incorrect data types.
- Invalid dates.
- Reversed date ranges.
- Negative values where prohibited.
- Excessively large values.
- Invalid enum values.
- Empty strings.
- Unexpected properties.
- Oversized request bodies.
- Malformed JSON.
- Invalid pagination parameters.

Verify that invalid requests are rejected safely and consistently.

Do not assume TypeScript types provide runtime validation.

## 7.4 Business Logic

Review important business operations and their invariants.

Examples include:

- Trade creation and editing.
- Trade deletion or archival, if supported.
- Account management.
- Performance aggregation.
- Goal updates.
- Alert configuration.
- Saved views.
- Workspace configuration.
- Report generation.
- Snapshot creation.
- OCR job orchestration.
- Recognition result import.

For each operation, determine:

- Preconditions.
- Validation rules.
- Authorization requirements.
- Database changes.
- Dependent calculations.
- Side effects.
- Error handling.
- Idempotency requirements.

Verify that critical business logic is not implemented exclusively in the frontend.

## 7.5 Error Handling

Verify that backend failures:

- Return appropriate status codes.
- Produce consistent, safe error responses.
- Do not expose stack traces or secrets to clients in production.
- Are logged with useful diagnostic context.
- Do not leave partial database writes.
- Do not report success after a failed operation.
- Are translated into understandable frontend feedback.

Preserve detailed internal diagnostics without exposing sensitive information publicly.

## 7.6 Background Tasks and Asynchronous Work

If the application uses background jobs or asynchronous processing, verify:

- Job creation.
- State transitions.
- Retry behavior.
- Failure handling.
- Cancellation behavior.
- Duplicate processing prevention.
- Resource cleanup.
- Timeouts.
- Persistence of job status.
- Recovery after service restart, where supported.

Do not assume that an asynchronous operation has completed merely because its request was accepted.

---

# 8. STAGE 4 — DATABASE, ORM, AND DATA INTEGRITY

## 8.1 Schema and Migration Audit

Inspect the actual database schema, ORM models, and migrations.

Verify:

- Relationships.
- Foreign keys.
- Unique constraints.
- Nullability.
- Defaults.
- Indexes.
- Ownership fields.
- Deletion behavior.
- Timestamp semantics.
- Numeric precision.
- Migration ordering.
- Schema-to-model consistency.

Identify orphan-prone relationships, missing constraints, unsafe defaults, and migration inconsistencies.

Do not apply destructive migrations to production.

## 8.2 Persistence Verification

Using an isolated test database or safe local environment, verify that:

- Create operations persist data.
- Read operations return the persisted values.
- Update operations modify the intended records.
- Delete operations follow the intended rules.
- Relationships remain consistent.
- Invalid writes are rejected.
- Failed operations do not leave unintended partial state.

Whenever possible, verify persistence across separate requests and process restarts rather than relying only on an in-memory object.

## 8.3 Transaction Safety

Review operations involving multiple dependent database writes.

Check whether transactions are required for:

- Trade imports.
- OCR result imports.
- Account updates.
- Workspace configuration changes.
- Snapshot creation.
- Related records.
- Alert event creation.

Verify rollback behavior when a dependent write fails.

## 8.4 Concurrency and Duplicate Prevention

Test relevant concurrent operations where feasible.

Check for:

- Duplicate imports.
- Lost updates.
- Duplicate alert events.
- Duplicate job creation.
- Concurrent refresh-token use.
- Inconsistent counters or aggregates.
- Race conditions in status transitions.

Use database constraints, transactions, idempotency keys, or other appropriate mechanisms where the existing requirements justify them.

Do not introduce arbitrary locking without evidence of a concurrency problem.

## 8.5 Financial Data Integrity

Review the storage and computation of:

- Entry and exit prices.
- Trade size.
- Profit and loss.
- Fees and commissions.
- Risk and reward.
- Currency.
- Timestamps.
- Account balances, where supported.
- Aggregated statistics.

Verify that financial values use appropriate numeric representations and precision.

Identify where floating-point arithmetic is acceptable and where decimal-safe arithmetic is required.

Do not change established formulas without a reproducible discrepancy and a regression test.

---

# 9. STAGE 5 — FRONTEND ↔ BACKEND INTEGRATION

This stage is mandatory and must go beyond code inspection.

## 9.1 Trace Complete Request Lifecycles

For each critical workflow, trace the complete path:

Frontend interaction → UI state → API client → HTTP request → authentication and authorization → controller → validation → business service → database or downstream service → response serialization → frontend query/cache → rendered result.

Verify each boundary.

Document the files and functions responsible for each major transition.

## 9.2 Contract Compatibility

Compare actual frontend expectations against backend responses.

Look for:

- Property name mismatches.
- Incorrect optional-field handling.
- Incompatible enum values.
- Different date formats.
- Nullability mismatches.
- Incorrect pagination structures.
- Inconsistent error envelopes.
- Incorrect status codes.
- Numeric values represented in unexpected formats.
- Missing response fields.
- Outdated shared types.
- API versions that have drifted apart.

If shared schemas exist, verify that they are used consistently.

Do not resolve contract mismatches by silently coercing invalid values into misleading data.

## 9.3 Authentication and Session Integration

Verify that:

- The frontend sends credentials through the intended mechanism.
- Protected endpoints reject unauthenticated requests.
- Expired access tokens are handled correctly.
- Refresh behavior follows the backend contract.
- Concurrent failed requests do not create uncontrolled refresh loops.
- Failed refresh attempts result in a secure session state.
- Logout invalidates the appropriate client state and server-side session or token where supported.
- Protected data is cleared when the user changes identity.
- Two-factor authentication flows work end to end if implemented.
- Session management and reauthentication work according to the actual design.

Do not expose refresh tokens to JavaScript if the architecture is intended to keep them in HttpOnly cookies.

Verify the actual cookie and CSRF protections rather than assuming them.

## 9.4 Mutation and Cache Consistency

For each important mutation, identify the dependent data that should change.

Examples include:

- Editing a trade should update the trade detail and relevant analytics.
- Deleting or archiving a trade should update the relevant history and aggregates.
- Changing an account should update all account-scoped queries.
- Updating a goal should refresh the goal and its progress.
- Changing a saved view should update its persisted representation.
- Updating a workspace should not alter unrelated workspaces.
- Importing OCR-recognized trades should refresh relevant trade history and metrics.
- Creating an immutable snapshot must not rewrite existing snapshots.

Adapt these expectations to the documented product behavior.

Verify that:

- Relevant queries are invalidated.
- Unrelated queries are not unnecessarily refreshed.
- Optimistic updates, if used, roll back safely.
- Failed mutations do not leave false success states.
- Old responses cannot overwrite newer selections.
- Account switching cannot display previously cached private data.

## 9.5 Real Backend Verification

Use actual backend endpoints in a safe test environment wherever possible.

If the application is running with mocked APIs, determine how to disable the mocks and configure real service communication.

Verify the actual network requests and responses using browser tooling, test clients, or appropriate logs.

Do not mark a frontend-to-backend workflow as fully verified if the backend was replaced by a mock.

---

# 10. STAGE 6 — COMPLETE OCR PIPELINE AUDIT

The OCR pipeline is a critical independent workstream.

Audit it from the screenshot upload through the final reviewed trade import.

Do not add ML or LLM functionality.

## 10.1 OCR Architecture and Responsibility Boundaries

Verify that the implemented architecture follows the intended separation:

- The frontend allows the user to submit a supported screenshot.
- The main backend authenticates and authorizes the request.
- The main backend validates the file and orchestrates the OCR job.
- The FastAPI service performs the supported recognition and extraction.
- The OCR service returns structured recognition results.
- The main backend validates and manages the job result.
- The frontend presents the result for user review and correction.
- The main backend persists approved trades through the established trade domain.
- Analytics and dependent dashboard data update after a successful import.

The OCR microservice must not bypass the main backend's authorization and trade-persistence rules by writing directly to the application's trade database unless the actual architecture explicitly establishes a justified and secure alternative.

Report any architectural deviation.

## 10.2 Screenshot Upload

Test:

- Valid supported image formats.
- Unsupported formats.
- Corrupted images.
- Empty uploads.
- Files exceeding configured limits.
- Incorrect MIME types.
- File extensions that do not match actual content.
- Very large dimensions.
- Images with unexpected aspect ratios.
- Multiple uploads if supported.
- Upload cancellation if supported.
- Network failures.
- Duplicate submissions.

Verify that the frontend sends the file using the expected request format.

Verify that the backend checks the actual file content where appropriate rather than trusting only the filename or client-provided MIME type.

Check file-size limits, resource consumption, storage cleanup, and temporary-file handling.

Do not use real user screenshots or sensitive account information in publicly accessible test artifacts.

## 10.3 OCR Job Lifecycle

Inspect the actual job model and state transitions.

Previously reported statuses include:

- PENDING.
- PROCESSING.
- COMPLETED.
- FAILED.
- CANCELLED.

Verify the statuses that actually exist.

For each status, determine:

- Which service owns the transition.
- Which transitions are permitted.
- How status is persisted.
- How errors are represented.
- How timeouts are handled.
- Whether duplicate processing is prevented.
- Whether cancellation is genuinely supported.
- Whether abandoned jobs can be detected.
- Whether the frontend can retrieve the correct job state.

Test valid and invalid state transitions.

Ensure that a job cannot be marked completed before its required processing and persistence steps have succeeded.

## 10.4 FastAPI Service Communication

Verify the main backend's actual communication with FastAPI.

Check:

- Base URL configuration.
- Request schema.
- Response schema.
- Timeouts.
- Connection failures.
- Invalid JSON.
- Unexpected response types.
- Service unavailability.
- Retry behavior.
- Correlation or job identifiers.
- Error translation.
- Authentication between services where required.
- Request-size limits.

Test at least:

1. Successful recognition.
2. OCR service unavailable.
3. Recognition timeout.
4. Invalid response payload.
5. OCR processing failure.
6. Missing or incomplete recognition fields.
7. Malformed image input.
8. Recovery after a temporary failure.

Do not claim that inter-service authentication is implemented unless it is verified in the actual architecture.

## 10.5 Recognition Accuracy and Schema Validation

The OCR service must return structured data compatible with the backend's recognition contract.

Verify fields that the implementation actually supports, such as:

- Instrument or symbol.
- Trade direction.
- Entry price.
- Stop-loss price.
- Take-profit price.
- Exit price.
- Volume or position size.
- Trade date and time.
- Profit and loss.
- Fees or commissions.
- Account or broker metadata, where present in the supported format.

Do not require every field if the screenshot format does not contain it.

Check:

- Numeric parsing.
- Decimal separators.
- Thousands separators.
- Negative values.
- Date parsing.
- Timezone assumptions.
- Symbol normalization.
- Missing fields.
- Confidence scores, if supported.
- Ambiguous values.
- Multiple trades in one screenshot, if supported.

Use representative, deterministic test images that do not expose private user information.

For supported formats, compare the extracted result against a manually verified expected dataset.

Measure extraction performance only against the fields and images actually tested. Do not invent a general OCR accuracy percentage from a few fixtures.

If the service uses deterministic image processing, verify that implementation directly. Do not describe the pipeline as AI-powered or machine-learning-based unless the code genuinely implements that technology.

## 10.6 Recognition Result Review

Verify that the frontend allows the user to inspect and correct the recognized values before import, if this is the intended workflow.

Test:

- Editing recognized fields.
- Missing values.
- Invalid numeric values.
- Invalid dates.
- Unsupported symbols.
- Direction changes.
- Canceling an import.
- Retrying recognition if supported.
- Handling a failed job.
- Preventing accidental import of unreviewed data where review is required.

Ensure that the displayed values correspond to the actual recognition result and that corrections are sent to the backend correctly.

## 10.7 Final Trade Import and Persistence

Verify the entire approved import workflow.

Confirm that:

- The backend receives the approved result.
- The backend validates the data again.
- The authenticated user owns the created trade.
- The correct trading account is associated with the trade.
- Valid records are persisted.
- Invalid records are rejected safely.
- Failed imports do not create partial or inconsistent records.
- Duplicate imports are prevented according to the product's intended behavior.
- Imported trades appear in the correct account history.
- Relevant analytics and dashboard data refresh.
- OCR job status and import status remain consistent.

If partial imports are supported, verify how individual record failures are reported and recovered.

Do not silently drop invalid records.

Do not assume that OCR recognition succeeded simply because a job returned COMPLETED. Recognition completion and successful trade import may be separate states.

## 10.8 OCR Security and Resource Management

Inspect:

- File type validation.
- File-size limits.
- Image decoding.
- Decompression or memory-exhaustion risks.
- Temporary-file cleanup.
- Path traversal risks.
- Unsafe filename handling.
- Unrestricted internal service access.
- Unauthorized job access.
- Cross-user job ID access.
- Sensitive image retention.
- Log exposure.
- Rate limiting.
- Resource exhaustion.
- Cancellation and timeout cleanup.

Use safe test files and isolated infrastructure.

Do not intentionally exhaust production resources.

## 10.9 OCR Acceptance Criteria

The OCR pipeline can be marked fully verified only when the critical workflow has been tested across the relevant service boundaries and persistence behavior.

If the OCR service is tested only with unit fixtures, classify the service-level integration as partially verified.

If the actual OCR service cannot be started, document the blocked checks rather than marking them as passed.

---

# 11. STAGE 7 — APPLICATION SECURITY AUDIT

Perform a focused, evidence-based security review of the frontend, backend, OCR service, database, and their integration boundaries.

## 11.1 Authentication

Inspect the actual implementation of:

- Registration, if supported.
- Login.
- Password hashing.
- Access-token issuance.
- Refresh-token issuance and rotation.
- Logout.
- Session invalidation.
- Two-factor authentication, if supported.
- Password reset, if supported.
- Email verification, if supported.
- Reauthentication for sensitive operations, if supported.

Check:

- Password hashing uses a suitable modern password-hashing implementation.
- Tokens are signed and verified correctly.
- Token expiration is enforced.
- Refresh tokens are rotated and invalidated according to the implementation.
- Refresh-token reuse is handled according to the intended security model.
- Sensitive tokens are not logged.
- Failed authentication does not leak unnecessary information.
- Brute-force protections are appropriate for the actual deployment.
- Authentication failures are handled consistently.

Do not infer secure behavior merely from the use of JWTs or password hashing.

## 11.2 Authorization and Ownership

For every important resource type, verify authorization at the backend boundary.

Test whether one authenticated test user can access another test user's:

- Trades.
- Trading accounts.
- Workspaces.
- Saved views.
- Goals.
- Alerts.
- OCR jobs.
- Recognition results.
- Reports.
- Snapshots.
- Uploaded files.

Test both read and write operations.

Use isolated test identities and disposable test data.

Where applicable, test direct object references by changing identifiers in requests.

A valid identifier is not proof of ownership.

Verify that unauthorized access is rejected without disclosing sensitive resource details.

## 11.3 Common Web Vulnerabilities

Inspect the code for relevant risks, including:

- Broken access control.
- IDOR and BOLA vulnerabilities.
- SQL injection.
- Unsafe raw database queries.
- Cross-site scripting.
- CSRF.
- SSRF.
- Path traversal.
- Unsafe file uploads.
- Open redirects.
- Mass assignment.
- Weak CORS configuration.
- Insecure cookie configuration.
- Missing security headers.
- Sensitive information exposure.
- Unsafe deserialization.
- Excessive request sizes.
- Resource-exhaustion vulnerabilities.
- Rate-limit bypasses.
- Insecure direct service access.

Test only in the authorized local or isolated environment.

Use the existing validation and security tooling where available.

Do not claim a vulnerability exists without evidence or a reproducible demonstration.

## 11.4 API Security

Verify:

- Authentication guards.
- Authorization guards.
- DTO or schema validation.
- Request size limits.
- Rate limiting where required.
- Appropriate CORS behavior.
- Safe error responses.
- Security-relevant logging.
- Protected internal endpoints.
- Access control on export and download routes.

Confirm that security checks are applied consistently rather than only on selected routes.

## 11.5 File and OCR Security

Check:

- Upload validation.
- File size and type restrictions.
- Temporary storage.
- Image processing limits.
- File download authorization.
- OCR job ownership.
- Internal service exposure.
- File cleanup and retention.
- Sensitive image logging.

## 11.6 Secrets and Configuration

Inspect source code and configuration for accidentally committed secrets or insecure defaults.

Check:

- Environment variable handling.
- Frontend-exposed environment variables.
- API keys.
- Database credentials.
- Signing secrets.
- OAuth credentials, if applicable.
- Internal service URLs.
- Development-only bypasses.
- Default passwords.
- Disabled verification flags.

Do not print secret values.

If a real credential is discovered, document the affected location without reproducing the secret. Recommend rotation through the approved operational process.

## 11.7 Dependency Security

Run available dependency and vulnerability checks using the repository's package managers.

Review both direct and transitive dependencies.

Distinguish:

- Confirmed exploitable vulnerabilities.
- Vulnerabilities requiring specific deployment conditions.
- Development-only findings.
- Low-confidence or informational findings.

Avoid indiscriminate major-version upgrades.

---

# 12. STAGE 8 — COMPLETE CROSS-FEATURE INTEGRATION AUDIT

The purpose of this stage is to determine whether Euforia's features work together correctly.

First build a dependency map from the actual codebase. Then test the relevant relationships.

Do not assume that every feature exists or that every relationship is required.

## 12.1 Accounts and Trade Management

Verify:

- Creating or selecting an account affects the correct data.
- Trades belong to the correct user and account.
- Account changes refresh dependent components.
- Editing a trade updates the relevant data.
- Deleting or archiving a trade follows the intended behavior.
- Trade history remains consistent with stored records.
- Account-specific data does not leak across contexts.

## 12.2 Dashboard and Analytics

Verify that:

- KPI widgets use the correct underlying dataset.
- Charts and tables agree on relevant aggregates.
- Date filters are applied consistently.
- Account and instrument filters are respected.
- Strategy, direction, and status filters work where supported.
- Empty filters and cleared filters behave correctly.
- Refreshing the page preserves only the intended state.
- Failed requests are not presented as valid metrics.
- Metric definitions are consistent across views.

Use deterministic trade fixtures to compare displayed metrics with independently calculated expected values.

## 12.3 Risk–Reward and Trading Calculators

If implemented, validate:

- Risk amount.
- Reward amount.
- Risk–reward ratio.
- Position sizing.
- Stop-loss and take-profit calculations.
- Win-rate reference tables.
- Break-even assumptions.
- Currency and precision handling.
- Boundary values.
- Invalid inputs.
- Zero-risk cases.
- Large or negative inputs where relevant.

Verify that calculators remain internally consistent when inputs change.

Do not modify formulas solely to match a visually expected value.

## 12.4 Goals and Performance Insights

Verify that:

- Goals use the correct metrics.
- Progress reflects the intended period and account scope.
- Changes to relevant trade data update dependent metrics.
- Missing data is handled correctly.
- Insights use the appropriate dataset.
- Sample-size limitations are represented accurately where implemented.
- Account and workspace changes do not leave stale results.

## 12.5 Alerts and Threshold Monitoring

Verify:

- Rule configuration persists.
- Rules use the intended metric definitions.
- Threshold boundaries behave correctly.
- Repeated evaluation does not create unintended duplicate events.
- Alert history is consistent.
- Dismissal or acknowledgment behaves as documented.
- Data changes trigger the appropriate reevaluation mechanism.
- Unauthorized users cannot modify or inspect another user's rules.

## 12.6 Workspaces, Templates, and Saved Views

Verify that:

- Workspaces retain their own configuration.
- Saved views restore the intended filters.
- Widget layouts persist according to the product contract.
- Switching contexts does not leak configuration.
- Changes to one workspace do not unexpectedly overwrite another.
- Invalid or deleted references are handled safely.
- Persistence remains consistent after navigation and reload.

## 12.7 Reports, Exports, and Snapshots

Verify:

- Exported data corresponds to the requested filters.
- Reports use the correct account and date range.
- Numeric values and currency labels are correct.
- Access control applies to generated files.
- Snapshot creation uses the correct source metrics.
- Historical snapshots remain immutable.
- Snapshot comparisons use compatible data.
- Failed generation is handled without misleading success states.

## 12.8 Notes, Academy, Playbook, and Other Modules

Inspect other modules that exist in the actual repository, including notes, educational content, strategies, or playbooks.

Determine:

- Whether data is genuinely persisted.
- Whether the module's APIs are integrated.
- Whether navigation and ownership are correct.
- Whether the module depends on shared account, workspace, or user context.
- Whether failures in one module affect unrelated dashboard functionality.

Do not ignore a module merely because it was not central to the earlier dashboard phases.

## 12.9 Interaction Matrix

Produce an explicit interaction matrix.

Example:

| Source action | Expected dependent behavior | Verification |
|---|---|---|
| Edit a trade | Relevant history and analytics update | Test and API evidence |
| Switch account | Account-scoped queries update | Integration test |
| Import an OCR trade | Trade persists and dependent metrics refresh | End-to-end test |
| Change global filters | Dependent widgets use the same filter context | Component or E2E test |
| Update a goal | Goal progress reflects the correct value | Integration test |
| Create a snapshot | Historical values remain immutable | Persistence test |

Populate this matrix using real features and dependencies discovered in the code.

---

# 13. STAGE 9 — REAL-TIME, MARKET DATA, AND EXTERNAL SERVICES

Audit the real-time and external integrations that actually exist.

## 13.1 WebSocket Behavior

If WebSockets or Socket.IO are implemented, verify:

- Connection establishment.
- Authentication.
- Authorization for private rooms or channels.
- Reconnection behavior.
- Subscription and unsubscription.
- Cleanup when components unmount.
- Duplicate event handling.
- Event schema compatibility.
- Stale connection handling.
- Error handling.
- Resource cleanup.
- Isolation between users and accounts.

Verify that private events are not broadcast to unauthorized users.

## 13.2 Market Data

Determine whether market data is:

- Real provider data.
- Broker-provided data.
- Locally generated data.
- Mock data.
- Cached historical data.
- Simulated real-time data.

Verify timestamp handling, instrument identifiers, price precision, and data freshness.

Do not represent simulated prices as live market prices.

Do not claim that broker synchronization works without testing an actual supported integration.

## 13.3 External Service Resilience

For each external service, document:

- Purpose.
- Configuration.
- Authentication.
- Timeout behavior.
- Error handling.
- Retry policy.
- Rate limits.
- Data validation.
- Logging.
- Test coverage.

Use mocks for deterministic failure tests when a real provider is unavailable, but distinguish those tests from actual integration verification.

---

# 14. STAGE 10 — TESTING AND AUTOMATION AUDIT

## 14.1 Test Inventory

Inventory the existing tests for:

- Frontend components.
- Frontend hooks.
- API clients.
- Backend controllers.
- Backend services.
- Database operations.
- Authentication.
- Authorization.
- OCR parsing.
- OCR orchestration.
- OCR persistence.
- Cross-module integration.
- End-to-end user journeys.

Identify critical functionality that has no meaningful tests.

Do not equate the number of test files with test quality.

## 14.2 Unit Tests

Verify pure functions and isolated business logic.

Prioritize:

- Financial calculations.
- Input validation.
- Data transformations.
- Recognition parsers.
- Status transitions.
- Authorization helpers.
- Date and timezone utilities.
- Aggregation functions.

Use explicit expected results and boundary cases.

## 14.3 Integration Tests

Test the real boundaries between:

- Frontend API clients and backend contracts.
- Backend services and repositories.
- Backend and database.
- Backend and FastAPI OCR.
- Backend and market services, where applicable.
- Authentication and protected endpoints.
- Mutations and cache invalidation.

Use isolated databases and services where possible.

## 14.4 End-to-End Tests

Build or reuse tests for critical user journeys, including:

1. Authentication.
2. Accessing a protected dashboard.
3. Selecting a trading account.
4. Viewing trade history.
5. Creating or editing a trade.
6. Updating dependent analytics.
7. Changing global filters.
8. Saving and restoring a view.
9. Switching workspaces.
10. Configuring a goal.
11. Triggering a test alert.
12. Generating an export.
13. Creating a snapshot.
14. Uploading a screenshot.
15. Receiving OCR results.
16. Correcting recognized values.
17. Importing approved trades.
18. Confirming the imported trades appear in the appropriate history and metrics.
19. Handling an API failure.
20. Verifying unauthorized access is rejected.

Adapt the list to the actual supported application features.

Do not invent routes or assume unsupported workflows exist.

## 14.5 Test Quality

Detect tests that:

- Assert nothing meaningful.
- Only verify mocked output while claiming end-to-end coverage.
- Depend on arbitrary sleeps.
- Are flaky.
- Reuse shared state unsafely.
- Leak test data.
- Depend on production credentials.
- Hide real errors.
- Have misleading names.
- Never exercise the code they claim to cover.

Improve tests only where necessary and justified.

## 14.6 Validation Commands

Use the actual repository scripts and package manager.

Run applicable checks for:

- Type checking.
- Linting.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Production builds.
- Database migration validation.
- Dependency security audits.
- Python tests.
- OCR linting and type checking, if configured.
- API contract validation.
- Accessibility checks.
- Other service-specific test suites.

For a monorepo, report the result for each application or service separately.

Do not report an entire monorepo as passing because one package built successfully.

---

# 15. STAGE 11 — PERFORMANCE, OBSERVABILITY, AND OPERATIONAL READINESS

## 15.1 Frontend Performance

Evaluate:

- Initial loading.
- Route transitions.
- Large tables.
- Chart rendering.
- Repeated API calls.
- Query invalidation.
- Bundle size.
- Rendering bottlenecks.
- Memory usage.
- Responsive behavior.

Use measurable evidence where the environment permits.

## 15.2 Backend Performance

Evaluate:

- Slow database queries.
- Missing indexes.
- N+1 queries.
- Expensive aggregations.
- Unnecessary repeated database calls.
- Large response payloads.
- Inefficient serialization.
- Excessive synchronous work.
- Resource cleanup.

Do not optimize speculative bottlenecks without evidence.

## 15.3 OCR Performance

Evaluate:

- Upload overhead.
- Image decoding.
- Processing duration.
- Memory usage where measurable.
- Timeout behavior.
- Concurrent jobs.
- Resource cleanup.
- Large-image handling.

Do not invent performance targets or measurements.

## 15.4 Logging and Observability

Verify that logs and diagnostic information help identify failures without exposing secrets or sensitive personal data.

Check:

- Structured error logging.
- Request correlation where available.
- OCR job correlation.
- Service health indicators.
- Database connectivity diagnostics.
- External integration failures.
- Appropriate log levels.
- Avoidance of sensitive request bodies and tokens.

## 15.5 Deployment Readiness

Inspect:

- Environment configuration.
- Production build.
- Database migration process.
- Service startup dependencies.
- Health checks.
- CORS.
- Cookie configuration.
- Logging.
- Error reporting.
- File storage.
- OCR service configuration.
- Required external services.
- Backup and recovery documentation.
- Rollback procedures.
- CI checks.

Do not assume a particular hosting provider.

Do not deploy or change production infrastructure during this audit.

---

# 16. STAGE 12 — DEFECT REPRODUCTION AND REMEDIATION

The audit must produce real findings and actionable fixes, not merely a theoretical checklist.

## 16.1 Defect Classification

Classify findings by severity.

### CRITICAL

Examples:

- Confirmed cross-user data exposure.
- Authentication bypass.
- Unauthorized financial data access.
- Material corruption of persisted financial records.
- Critical exploitable vulnerabilities.
- A core workflow that corrupts data or cannot operate safely.

### HIGH

Examples:

- Major core workflow failure.
- Broken OCR imports causing incorrect or inconsistent records.
- Missing authorization on a sensitive resource.
- Significant incorrect financial calculations.
- Severe session-management defects.
- Critical integration failures preventing core application use.

### MEDIUM

Examples:

- A substantial feature fails under certain supported conditions.
- Analytics become stale after specific mutations.
- Important validation or recovery behavior is incorrect.
- A secondary module has a significant functional defect.

### LOW

Examples:

- Minor display defects.
- Non-critical usability inconsistencies.
- Limited-impact warnings or edge cases.

These are examples, not assumptions that the defects exist.

## 16.2 Fixing Confirmed Defects

For each confirmed defect:

1. Reproduce it.
2. Capture the relevant evidence.
3. Identify the root cause.
4. Identify affected components and service boundaries.
5. Implement the smallest safe correction.
6. Add or update a regression test.
7. Run the relevant test.
8. Run affected broader regression tests.
9. Inspect the final diff.
10. Record the result.

Prioritize CRITICAL and HIGH issues.

Do not make a speculative fix merely because a pattern looks unusual.

Do not refactor unrelated modules.

Do not modify financial formulas without an explicit correctness analysis and regression tests.

## 16.3 Remediation Limits

If a fix requires:

- Production credentials.
- An unavailable external provider.
- Destructive database changes.
- A major architectural redesign.
- An unapproved change in product behavior.
- A security-sensitive operation outside the authorized environment.

Do not perform it automatically.

Document the defect, evidence, impact, required action, and dependency.

## 16.4 No Fake Success

Do not:

- Replace real API calls with mock responses to make the UI appear functional.
- Add fallback data that conceals backend failures.
- Catch and ignore exceptions.
- Remove failing tests.
- Lower test expectations without justification.
- Mark blocked workflows as passed.
- Hardcode success responses.
- Claim that an OCR import worked when only recognition completed.
- Claim that a database write succeeded without verifying persistence.

---

# 17. REQUIRED EVIDENCE AND ACCEPTANCE STANDARDS

Every important audit conclusion must be tied to evidence.

Acceptable evidence includes:

- Source files and relevant functions.
- Test files and assertions.
- Actual test execution results.
- API request and response observations.
- Database persistence checks.
- Browser interaction results.
- OCR job and recognition results.
- Logs with sensitive data removed.
- Reproducible defect descriptions.
- Measured performance results.

For every significant feature, distinguish between:

1. **Code inspected** — implementation exists in source.
2. **Unit tested** — isolated behavior passed.
3. **Integration tested** — relevant service boundaries passed.
4. **End-to-end tested** — the actual supported workflow passed across its required boundaries.
5. **Production verified** — verified against the actual production environment, only if explicitly authorized and genuinely performed.

These categories are not interchangeable.

Use the following result statuses:

- **PASS** — tested and verified with relevant evidence.
- **PARTIAL** — some aspects passed, but important behavior remains unverified.
- **FAIL** — a defect was reproduced or the required behavior did not pass.
- **BLOCKED** — a documented dependency prevented validation.
- **NOT IMPLEMENTED** — the required functionality is absent.
- **NOT APPLICABLE** — the check does not apply to the actual architecture.

Do not mark an entire subsystem PASS when only one isolated test passed.

---

# 18. FINAL DELIVERABLES

Produce a comprehensive audit report in Markdown in the repository's established documentation location if one exists. Otherwise, propose a clearly named audit report file without overwriting unrelated documentation.

Do not commit or push changes unless explicitly authorized.

The report must contain the following sections.

## A. Executive Summary

Summarize:

- Overall application condition.
- Most significant verified findings.
- Number of findings by severity, based on the actual audit.
- Critical unresolved blockers.
- Main fixes completed.
- Major unverified areas.
- Final recommendation.

Do not invent counts.

## B. Architecture and Service Inventory

Document:

- Actual frontend applications.
- Backend applications and modules.
- OCR service.
- Database and ORM.
- Shared packages.
- Market and real-time services.
- External integrations.
- Deployment components.
- Test infrastructure.

Include a simple Mermaid architecture diagram based on the actual implementation.

Use a flowchart that represents verified service relationships. Mark uncertain or mock-only boundaries explicitly.

## C. Frontend Audit

Include:

- Routes inspected.
- Main UI components reviewed.
- Functional controls.
- Broken or incomplete interactions.
- API integration findings.
- State-management issues.
- Mock-data findings.
- Console and browser errors.
- Responsive and accessibility findings.

## D. Backend Audit

Include:

- API endpoint inventory or a reference to the detailed inventory.
- Authentication and authorization findings.
- Validation findings.
- Business-logic findings.
- Persistence findings.
- Error-handling findings.
- Missing or inconsistent contracts.
- Backend integration defects.

## E. Database and Data Integrity Report

Include:

- Schema and migration findings.
- Ownership and relationship checks.
- Transaction and concurrency findings.
- Financial precision findings.
- Persistence tests.
- Data integrity defects.
- Outstanding risks.

## F. Frontend-to-Backend Integration Report

Provide a table with:

| Workflow | Frontend | API | Database | Integration result | Evidence |
|---|---|---|---|---|---|

Include the important workflows discovered in the repository.

## G. OCR End-to-End Report

Document:

- Upload behavior.
- File validation.
- Backend orchestration.
- FastAPI communication.
- Job lifecycle.
- Recognition schema.
- Recognition test results.
- User review and correction.
- Trade persistence.
- Duplicate prevention.
- Analytics refresh.
- Security and resource management.
- Remaining OCR blockers.

Clearly distinguish mocked recognition from actual service execution.

## H. Cross-Feature Interaction Matrix

List each important source action and its expected dependent behavior.

For every tested relationship, record:

- Expected behavior.
- Actual behavior.
- Test method.
- Result.
- Evidence.
- Known limitations.

## I. Security Audit Report

Document:

- Authentication.
- Session management.
- Authorization.
- Cross-user data isolation.
- Input validation.
- API security.
- File-upload security.
- OCR security.
- Secrets handling.
- Dependency audit.
- Confirmed vulnerabilities.
- Severity.
- Recommended remediation.

Never include secret values or sensitive personal data.

## J. Test and Build Results

Provide the actual commands executed and their results for each relevant application and service.

Include:

- Type checking.
- Linting.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Production builds.
- Database checks.
- OCR tests.
- Dependency security checks.
- Accessibility checks, where available.

For each check, record:

- Command.
- Application or package.
- Result.
- Relevant output summary.
- Limitations.
- Whether the check was rerun after fixes.

## K. Performance and Reliability Report

Include:

- Measured loading behavior where available.
- Request efficiency.
- Query and cache behavior.
- Database bottlenecks.
- OCR processing measurements.
- Error handling.
- Observability gaps.
- Remaining reliability risks.

Only report measurements that were actually obtained.

## L. Defect and Remediation Register

Use a table with:

| ID | Severity | Component | Finding | Reproduction evidence | Fix | Regression test | Status |
|---|---|---|---|---|---|---|---|

Include all significant findings. Do not omit unresolved defects.

## M. Production Readiness Checklist

Evaluate:

- Frontend functionality.
- Backend functionality.
- Database persistence.
- Frontend/backend integration.
- OCR integration.
- Security.
- Financial correctness.
- Cross-module consistency.
- Test coverage and reliability.
- Performance.
- Observability.
- Environment configuration.
- Migration safety.
- Backup and recovery.
- Deployment process.
- Documentation.

Use PASS, PARTIAL, FAIL, BLOCKED, NOT IMPLEMENTED, or NOT APPLICABLE as appropriate.

## N. Remaining Issues and Recommended Actions

Organize remaining work by:

1. Immediate security and data-integrity fixes.
2. Critical core-functionality fixes.
3. Major integration defects.
4. Important reliability issues.
5. Lower-priority defects.
6. Unverified external dependencies.

For each issue, state what is needed, why it matters, and how it can be verified.

## O. Final Readiness Verdict

Choose exactly one:

### 1. READY FOR STAGING

The available evidence supports a controlled staging deployment, with no known critical blockers. Production readiness still requires the appropriate staging and release checks.

### 2. READY FOR PRODUCTION REVIEW

The required application checks are sufficiently complete to support a formal production release review. This is not automatic authorization to deploy.

### 3. NOT READY

Confirmed defects, unresolved security risks, financial correctness issues, missing core integrations, or insufficient validation prevent a responsible release recommendation.

### 4. INDETERMINATE

Access limitations or missing evidence prevent a reliable readiness judgment.

Explain the verdict using concrete evidence.

Do not automatically select a positive verdict because the audit has finished.

## P. Final Handoff

Provide:

- A list of files changed.
- A summary of fixes implemented.
- The final validation results.
- Uncommitted changes, where accessible.
- Required environment or configuration actions.
- Outstanding risks.
- The recommended next actions for the project owner.

Do not commit, push, or deploy without authorization.

---

# 19. FINAL EXECUTION CHECKLIST

Before declaring the audit complete, confirm that you have:

- [ ] Inspected the actual repository and architecture.
- [ ] Established a baseline.
- [ ] Audited frontend routes and interactions.
- [ ] Audited the main backend API.
- [ ] Reviewed database schema and persistence.
- [ ] Traced actual frontend-to-backend request lifecycles.
- [ ] Distinguished mocks from real implementations.
- [ ] Audited the OCR upload-to-import workflow.
- [ ] Tested relevant authentication and authorization boundaries.
- [ ] Checked cross-user and cross-account data isolation.
- [ ] Validated critical financial calculations.
- [ ] Evaluated important cross-module dependencies.
- [ ] Inspected real-time and external integrations where applicable.
- [ ] Executed available test suites.
- [ ] Reproduced and documented confirmed defects.
- [ ] Implemented safe, focused fixes where justified.
- [ ] Added regression tests for relevant fixes.
- [ ] Reran affected tests after remediation.
- [ ] Reviewed performance and operational readiness.
- [ ] Produced the complete audit report.
- [ ] Classified every major finding honestly.
- [ ] Selected a readiness verdict supported by evidence.
- [ ] Avoided unapproved production operations.

If a checklist item cannot be completed, document why and classify the associated risk accurately.

# FINAL DIRECTIVE

Perform a genuine, evidence-based audit of the entire Euforia application.

Verify the actual frontend, backend, database, OCR microservice, API contracts, authentication, authorization, data integrity, cross-module workflows, and operational readiness.

Do not rely on source-code presence alone. Run the application and tests wherever possible. Trace real requests and persisted data. Verify service-to-service communication. Reproduce defects before fixing them. Add regression tests and validate every correction.

Do not fabricate results, conceal missing functionality, or confuse mock behavior with a working integration.

Preserve the existing architecture and financial correctness.

Fix confirmed defects safely, but do not introduce unrelated features or perform unapproved production operations.

The final deliverable must be a trustworthy technical assessment of what works, what does not work, what remains unverified, what was fixed, and whether Euforia is ready for staging or production review.