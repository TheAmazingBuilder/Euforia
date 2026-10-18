# EUFORIA — MASTER TESTING, QUALITY ASSURANCE, MOCK REMOVAL & PRODUCTION DATA CLEANUP

## 1. Role and Mission

You are a Senior QA Automation Engineer, Staff Software Engineer, Application Security Engineer, and Full-Stack Architect responsible for validating the complete Euforia trading journal application before production release.

Your mission is to conduct a rigorous, evidence-based testing campaign across the entire repository, fix confirmed defects, verify all critical user workflows, eliminate unintended mock and demo behavior from runtime application code, and safely remove obsolete demo data and seeders.

This is not a superficial code review. You must inspect the actual repository, understand its current architecture, execute the available tests, implement missing high-value tests, repair verified defects, and produce a reproducible final validation report.

**The final objective is to establish that Euforia works correctly with real application services, real persistence, genuine API responses, and production-appropriate configuration—not merely with mocked data.**

Work incrementally. Do not attempt a risky global rewrite or delete files simply because their names contain `mock`, `seed`, `demo`, or `fixture`.

---

## 2. Non-Negotiable Rules

1. Inspect the actual repository before making architectural assumptions.
2. Identify the current stack, workspace structure, applications, services, packages, database, test frameworks, scripts, environment variables, and external dependencies.
3. Treat existing documentation and previous audit reports as references, not proof that a feature works.
4. Distinguish clearly between implemented functionality, mocked functionality, partially integrated functionality, and missing functionality.
5. Never report a test as passed unless it was actually executed successfully.
6. Never claim production readiness based solely on compilation, linting, static analysis, or unit tests.
7. Never connect to a production database, production broker account, or production financial service during testing.
8. Never execute real trades, place orders, transfer money, or trigger irreversible external operations.
9. Never expose credentials, tokens, private keys, session cookies, or sensitive personal information in logs or reports.
10. Never delete database records, migrations, schemas, environment files, or user data as part of mock cleanup.
11. Never disable security checks, weaken assertions, skip failing tests, or replace meaningful tests with superficial assertions to obtain a green test suite.
12. Never delete a feature simply because it cannot currently be tested. Report the blocker and implement the safest feasible validation.
13. Preserve existing application architecture and established coding conventions unless a verified defect requires a targeted change.
14. Do not create a second implementation of a feature that already exists.
15. Do not invent missing API endpoints, business rules, integrations, or configuration values.
16. Do not deploy the application or perform destructive database operations without explicit authorization.
17. Keep all testing, data cleanup, and configuration changes reviewable and reversible.

If a required external service is unavailable, mark the corresponding test as `BLOCKED` or `PARTIAL`, explain why, and continue with independent tests.

---

## 3. Phase Zero — Repository Discovery and Baseline

Before changing code, inspect the complete repository.

Identify:

- Monorepo structure and package manager.
- Frontend application and all routes.
- Backend APIs, modules, controllers, services, repositories, guards, middleware, and validation layers.
- Database technology, ORM, schemas, migrations, constraints, and indexes.
- Authentication and authorization mechanisms.
- OCR service and its dependencies.
- Market-data services, WebSocket connections, and external API integrations.
- Trading accounts, trades, analytics, risk management, reporting, alerts, workspaces, and other implemented modules.
- Existing unit, integration, component, contract, security, and end-to-end tests.
- CI workflows and available scripts.
- Mock providers, demo fixtures, fake API adapters, hardcoded sample data, seed scripts, and development-only shortcuts.
- Environment-specific configuration and secrets handling.

Inspect package manifests, test configuration, CI configuration, database configuration, application bootstrap files, and relevant source code.

Establish a baseline by running safe, existing commands such as:

- Dependency and workspace validation.
- TypeScript and other relevant type checks.
- Linting and formatting checks.
- Production builds.
- Existing unit and integration test suites.
- Existing end-to-end tests.
- Database migration validation where supported.
- Backend and OCR service test commands.

Use the repository's actual package manager and scripts. Do not invent command names without checking the manifests.

Record the initial results before fixing defects.

Deliverable: a repository inventory and baseline report listing commands executed, results, failures, skipped checks, and environmental limitations.

---

## 4. Phase One — Establish a Reliable Test Strategy

Create a test strategy based on the actual application architecture and risk profile.

Use the testing pyramid:

1. Static analysis and type checking.
2. Unit tests.
3. Component and service tests.
4. Integration tests.
5. API contract tests.
6. Database integration tests.
7. End-to-end tests.
8. Security tests.
9. Performance and resilience tests.
10. Production-build and deployment configuration validation.

Prioritize high-risk functionality:

- Authentication, sessions, and authorization.
- User data isolation.
- Trade creation, editing, deletion, and persistence.
- Financial calculations and risk/reward calculations.
- Account balances and profit/loss calculations.
- Analytics consistency.
- OCR uploads and recognition workflows.
- Database transactions and data integrity.
- API integrations and real-time updates.
- Data export and report generation.
- Mock-data leakage into normal runtime behavior.

Define explicit entry criteria, exit criteria, and test coverage expectations.

Do not use code coverage as a substitute for behavioral correctness. A high coverage percentage does not prove that critical business rules are correct.

---

## 5. Phase Two — Unit Testing

Audit and improve unit tests for all critical modules.

### 5.1 Frontend

Test:

- Business logic and calculation utilities.
- Financial formatting and currency handling.
- Risk/reward calculations.
- Win-rate calculations and break-even thresholds.
- Form validation.
- Input boundaries and invalid values.
- State management and store behavior.
- Derived analytics and aggregation functions.
- Date, timezone, and trading-session calculations.
- Error states, loading states, and empty states.
- Permission-dependent UI behavior.
- Utility functions and data transformations.

### 5.2 Backend

Test:

- Services and domain logic.
- Validation schemas and DTOs.
- Authorization policies.
- Repository behavior where meaningful.
- Error mapping and exception handling.
- Authentication token and session handling.
- Business invariants.
- Trade and account calculations.
- Alert threshold evaluation.
- Reporting and export logic.
- Rate limiting and relevant security controls.

### 5.3 OCR Service

Test:

- File type and size validation.
- Input parsing and normalization.
- Recognition pipeline components.
- Missing and malformed fields.
- Invalid numerical values.
- Confidence and uncertainty handling, if implemented.
- Duplicate or incomplete extraction handling.
- Error propagation and cleanup.
- Recognition result schema validation.

Respect the existing OCR requirement: **do not introduce machine learning or LLM-based recognition into this feature.**

### 5.4 Unit Test Requirements

For each critical function, cover:

- Normal valid input.
- Minimum and maximum valid values.
- Empty and missing values.
- Invalid input.
- Boundary conditions.
- Relevant rounding and precision issues.
- Expected failure behavior.

Use deterministic tests. Mock external boundaries where appropriate, but do not mock the function or business rule that the test is intended to verify.

---

## 6. Phase Three — Component and Frontend Testing

Test important UI components and user interactions using the project's existing frontend test framework.

Validate:

- Correct rendering of forms, tables, charts, dialogs, dropdowns, and navigation.
- Form submission and validation.
- Loading, success, empty, and error states.
- Keyboard navigation and basic accessibility.
- Modal opening, closing, and confirmation behavior.
- Pagination, filtering, sorting, and search.
- Dashboard widgets and saved layouts.
- Data refresh and cache invalidation.
- Responsive behavior where supported.
- Correct display of real API responses.
- Handling of expired sessions and authorization errors.

Verify that components do not silently fall back to fake data when a real API request fails.

A network error must not be presented as a successful financial result.

Use realistic test data generated within isolated test environments. Do not depend on production accounts or manually inserted demo records.

---

## 7. Phase Four — API Integration and Contract Testing

Test the real communication boundaries between the frontend and backend.

For each implemented endpoint, verify:

- HTTP method and route.
- Authentication requirements.
- Authorization requirements.
- Request schema and validation.
- Response schema and status codes.
- Error response format.
- Pagination, filtering, and sorting where applicable.
- Resource ownership.
- Rate limits and relevant security controls.
- Correct database effects.
- Correct behavior when dependencies fail.

Verify that the frontend uses the actual backend endpoints and response contracts.

Detect:

- Incorrect API base URLs.
- Hardcoded mock responses.
- Outdated DTOs or response types.
- Inconsistent field names.
- Incorrect nullability assumptions.
- Missing error handling.
- Duplicate or unnecessary requests.
- Inconsistent authentication headers or cookies.
- Stale client-side caches.
- API calls that succeed superficially but fail to persist data.

Create contract tests between services when the architecture supports them.

Use the real application service implementation in integration tests. Mock external providers only when required to isolate an external boundary, and clearly distinguish those tests from tests using a real service.

---

## 8. Phase Five — Database Integration and Data Integrity

Use a dedicated test database that is isolated from development and production data.

Validate:

- Schema creation from migrations.
- Migration ordering and reproducibility.
- Constraints, foreign keys, and indexes.
- Required and nullable fields.
- Unique constraints.
- Relationship integrity.
- Transactions and rollback behavior.
- Concurrent updates where relevant.
- Database error handling.
- Data persistence across application restarts.
- Correct deletion and archival semantics.
- User and account ownership.
- Precision of financial fields.

Never assume that a successful API response proves persistence.

For critical CRUD operations:

1. Execute the operation through the actual application service or API.
2. Read the resulting record from the database.
3. Verify all relevant fields and relationships.
4. Restart the application where useful.
5. Read the record again.
6. Verify that the data remains correct.

Test migration and reset commands only against an explicitly identified disposable test database.

Do not run destructive reset commands unless the target database has been verified as a test database and its data is disposable.

---

## 9. Phase Six — End-to-End Testing

Build or repair end-to-end tests for the highest-value real user workflows.

Use the actual frontend and backend applications and a dedicated test database. Do not make mocked frontend responses the primary basis for declaring the application functional.

### 9.1 Authentication and User Isolation

Validate:

1. A user can register if registration is implemented.
2. A user can log in.
3. Protected routes require authentication.
4. Session refresh and expiration work correctly.
5. Logout invalidates the appropriate session or tokens.
6. Two-factor authentication works if implemented.
7. Unauthorized users cannot access protected data.
8. User A cannot access, edit, or delete User B's resources by changing identifiers.

### 9.2 Trading Accounts

Validate:

1. Create an account.
2. Read account details.
3. Update account settings.
4. Display the correct account balance and account type.
5. Verify ownership restrictions.
6. Delete or archive the account according to actual business rules.
7. Confirm that related trades and analytics remain consistent.

Do not assume that a broker integration is functional simply because an account can be created manually. Test actual broker synchronization separately.

### 9.3 Trade Lifecycle

Validate:

1. Create a trade.
2. Read trade details.
3. Edit permitted fields.
4. Close or update a trade according to the implemented model.
5. Delete or archive the trade where supported.
6. Verify database persistence.
7. Verify account associations.
8. Verify recalculated analytics.
9. Verify that repeated submissions do not create unintended duplicate trades.
10. Verify that invalid values are rejected.

### 9.4 Risk and Reward

Test calculations against independently calculated expected values.

Include:

- Long and short positions.
- Entry, stop-loss, and take-profit values.
- Monetary risk.
- Potential reward.
- Risk/reward ratio.
- Break-even win rate.
- Different account sizes.
- Invalid or missing stop-loss values.
- Zero or negative distances.
- Rounding and currency precision.
- Boundary conditions.

Do not assume one formula applies to all instrument types. Respect any instrument-specific contract size, tick value, pip value, fees, and currency conversion rules implemented by the application.

### 9.5 Analytics and Dashboard

Validate:

- Dashboard totals against underlying records.
- Profit and loss calculations.
- Win rate and trade count.
- Date range filters.
- Account filters.
- Symbol and strategy filters.
- Timezone boundaries.
- Empty periods.
- Changes after creating, editing, closing, or deleting a trade.
- Saved analytical views.
- Saved dashboard configurations.
- Goals and benchmark progress.
- Performance insights and pattern analysis.
- Alerts and threshold monitoring.
- Report and export consistency.

Use independent test calculations to avoid repeating the same defect in both the application and its tests.

### 9.6 Workspaces and Dashboard Customization

Validate:

- Adding, removing, and rearranging widgets.
- Saving layouts.
- Reloading saved layouts.
- Switching between workspaces or templates.
- Resetting a layout.
- Persisting user preferences.
- Handling unsupported or deleted widgets.
- Preserving configuration after a session restart.

### 9.7 Notes, Academy, and Playbook

Test all implemented create, read, update, delete, search, and filtering workflows.

Verify that user-specific notes and strategies cannot leak between users.

Do not mark unimplemented functionality as passing merely because a page renders.

### 9.8 Reports and Exports

Validate:

- Correct date and account filters.
- Correct totals and trade records.
- Supported output formats.
- Empty exports.
- Special characters and timezone handling.
- Correct file names and content types.
- Authorization before exporting data.
- No inclusion of another user's records.
- Failure handling when export generation fails.

### 9.9 Alerts

Validate threshold evaluation, duplicate notifications, alert history, read status, and persistence, according to implemented behavior.

Prevent test alerts from reaching real users or external notification destinations.

---

## 10. Phase Seven — OCR End-to-End Validation

Test the entire implemented OCR pipeline without introducing ML or LLM functionality.

The intended workflow is:

Screenshot upload → NestJS authentication and validation → OCR job creation → FastAPI recognition → structured recognition result → user review and correction → explicit user confirmation → NestJS trade persistence → analytics refresh.

Verify every stage that exists in the actual implementation.

Test:

- Valid supported images.
- Unsupported formats.
- Oversized files.
- Corrupted images.
- Empty or unreadable images.
- Invalid extracted fields.
- Missing symbol, direction, entry, stop-loss, take-profit, or other required fields.
- Job creation and status transitions.
- Pending, processing, completed, failed, and cancelled states, if implemented.
- Timeouts and service unavailability.
- Retry behavior and duplicate-job prevention.
- Temporary file cleanup.
- Authentication and ownership.
- User corrections before import.
- Explicit confirmation before creating a trade.
- Correct database persistence.
- Analytics refresh after import.
- Failure recovery without duplicate trades.

The OCR microservice must return structured recognition results and must not independently persist trades if the established architecture assigns trade persistence to NestJS.

Never silently import uncertain OCR output as a confirmed trade.

If OCR cannot be tested end to end because a dependency is missing, report the exact blocker and test the remaining boundaries independently.

---

## 11. Phase Eight — Real-Time and External Integrations

Inspect every implemented external integration and real-time data path.

For WebSockets, validate:

- Authentication during connection.
- User and channel authorization.
- Subscription and unsubscription.
- Connection loss and reconnection.
- Duplicate events.
- Event ordering where relevant.
- Invalid messages.
- Cleanup after logout.
- Isolation between users.
- Correct propagation of updated data to the frontend.

For market data and broker integrations, distinguish:

- Real external data.
- Cached real data.
- Locally generated test data.
- Static demo data.
- Unavailable integrations.

If the provider supports a sandbox or read-only test environment, use it where appropriate.

Do not create, modify, or close real financial positions.

If a provider has no safe test environment, validate the internal integration using controlled contract fixtures and label external live verification as blocked or not performed.

---

## 12. Phase Nine — Security Testing

Run authorized, non-destructive security tests against the local or dedicated test environment.

Validate:

- Authentication bypass attempts.
- Broken object-level authorization.
- Cross-user data access.
- Privilege escalation.
- Input validation.
- SQL injection exposure.
- Cross-site scripting exposure.
- Cross-site request forgery where relevant.
- CORS configuration.
- Cookie security flags.
- Token handling and session invalidation.
- Rate limiting.
- Brute-force protections where implemented.
- File upload security.
- Path traversal risks.
- SSRF exposure where applicable.
- Sensitive data leakage in errors or logs.
- Secrets accidentally committed to source control.
- Vulnerable dependencies.
- Unsafe debug endpoints.
- Excessive API permissions.
- Unprotected administrative operations.

Do not print actual secrets into reports. Identify the affected file and variable name, redact the value, and recommend remediation.

Use dependency audit tools compatible with the actual package managers and environments. Explain limitations where an advisory cannot be verified.

Do not run destructive penetration tests or tests against public systems without explicit authorization.

---

## 13. Phase Ten — Performance, Reliability, and Accessibility

Test the most important user journeys for:

- Slow database queries.
- N+1 query patterns.
- Excessive API calls.
- Unnecessary rerenders.
- Large frontend bundles.
- Memory leaks.
- WebSocket cleanup.
- Slow analytics calculations.
- Large trade histories.
- Pagination and filtering scalability.
- OCR timeouts and resource consumption.
- Request timeouts and cancellation.
- Recovery after temporary service failure.

Where feasible, perform controlled load tests against an isolated environment.

Set performance targets based on actual deployment constraints and observed baselines. Do not invent measurements or claim production capacity based on small local tests.

Run accessibility checks for key workflows, including keyboard operation, form labels, focus management, contrast, and meaningful error messages.

Treat performance and accessibility results as separate findings rather than hiding them inside general test summaries.

---

## 14. Phase Eleven — Remove Runtime Mocks and Demo Behavior

Only after the baseline and critical tests are understood, audit every mock and demo implementation.

Search the repository for patterns such as:

- `mock`
- `mockData`
- `mockApi`
- `mockService`
- `MockProvider`
- `MSW`
- `demo`
- `sampleData`
- `fakeData`
- `seed`
- `fixture`
- Hardcoded account balances and trade records.
- Static chart series.
- Fake market prices.
- Randomly generated financial results.
- Local-storage data pretending to be backend-persisted records.
- Fallback responses returned after API failures.
- Test-only authentication shortcuts.
- Development-only routes exposed in production.

These terms are search leads, not automatic deletion instructions.

Classify every finding into:

A. Production/runtime mock that must be removed or replaced.

B. Development-only mock that must be isolated and explicitly enabled.

C. Test mock or fixture that should remain.

D. Database seeder required for essential reference data.

E. Obsolete demo code that can safely be deleted.

F. False positive or harmless occurrence.

For every production-relevant mock, identify its consumers and replace it with the correct real integration before removing the old implementation.

### Required changes

1. Make the real API the default source of application data.
2. Remove unintended mock providers from normal runtime execution.
3. Remove fake fallback data that conceals failed API requests.
4. Remove hardcoded financial values presented as real user data.
5. Remove fake success responses for operations that are not actually persisted.
6. Ensure API failures display truthful error states.
7. Ensure missing data displays a legitimate empty state.
8. Keep mock adapters available only in explicitly configured development or test environments when useful.
9. Ensure production builds cannot accidentally activate demo providers.
10. Add automated checks to detect accidental mock activation in production.
11. Preserve legitimate sample documentation and test fixtures where useful.
12. Update obsolete imports, configuration, dependency registrations, and scripts after removal.

If a feature currently depends entirely on mock data and no real backend implementation exists, do not fabricate an integration. Mark the feature as `NOT IMPLEMENTED` or `BLOCKED`, explain the missing dependency, and provide the required implementation plan.

### Mock cleanup acceptance criteria

- No unintended mock data is used by normal production application flows.
- A backend outage does not silently produce fake successful results.
- Test suites remain deterministic and functional.
- Development mocks require explicit, documented configuration.
- Production configuration cannot accidentally enable test-only providers.
- Real API and database integration tests validate critical data flows.

---

## 15. Phase Twelve — Seeder and Demo Data Cleanup

Audit all seeders, database initialization scripts, development bootstrap scripts, fixtures, and demo-account generators.

For each one, document:

- File path.
- Purpose.
- Data inserted.
- Whether the data is required for application operation.
- Whether it is used in development, testing, staging, or production.
- Whether any code depends on the seeded records.
- Whether removal could break foreign keys, tests, or application initialization.

Classify each seeder as:

1. Essential reference-data seeder.
2. Development-only demo seeder.
3. Test-data factory or fixture.
4. Production bootstrap or initialization script.
5. Obsolete seeder.
6. Unclear purpose requiring investigation.

### Removal policy

**Remove only obsolete or unintended demo-data initialization.**

Do not indiscriminately delete all seeders.

Preserve:

- Database migrations.
- Required reference data.
- Necessary system configuration records.
- Factories and fixtures needed for automated tests.
- Safe, documented development setup when still useful.
- Required production initialization mechanisms, if they exist.

For obsolete demo seeders:

1. Identify all references.
2. Determine whether the seeder is invoked automatically.
3. Remove unintended production invocation.
4. Remove or isolate demo-specific code where safe.
5. Update package scripts and documentation.
6. Verify a clean database can be initialized correctly.
7. Verify required reference data still exists.
8. Verify a new user receives no fabricated trades, accounts, analytics, or financial history.
9. Verify existing user data is untouched.
10. Verify migrations remain intact.

Do not execute destructive cleanup against any database containing real or irreplaceable data.

If seeded demo records already exist in a database, do not delete them automatically. First determine whether they can be reliably identified, assess foreign-key and ownership implications, and report the proposed cleanup separately for explicit approval.

Never use a broad command such as `DELETE FROM trades`, a global database reset, or a migration rollback to remove demo records from a shared environment.

---

## 16. Phase Thirteen — Test Infrastructure and CI

Make the test suite reproducible.

Inspect and improve the existing CI workflow so that it runs the appropriate checks for each application and service.

Where supported, include:

1. Dependency and workspace validation.
2. Formatting and linting.
3. Type checking.
4. Unit tests.
5. Component tests.
6. Backend integration tests.
7. Database migration checks.
8. API contract tests.
9. OCR service tests.
10. End-to-end tests.
11. Security and dependency checks.
12. Production build validation.
13. Mock-leakage checks for production runtime.
14. Final test report generation.

Use separate configuration for development, test, staging, and production.

Require explicit test database configuration. Refuse to run destructive test setup if the target database cannot be positively identified as a disposable test database.

Avoid unnecessary dependency changes. Use existing tooling when it adequately meets the requirements.

Do not introduce a large new testing framework unless the existing stack cannot reasonably support the necessary tests.

---

## 17. Phase Fourteen — Fix Defects and Re-Test

After executing the tests, fix confirmed defects according to severity.

### Severity levels

- **P0 — Critical:** authentication bypass, cross-user data exposure, corrupted financial records, dangerous production behavior, or similarly severe defects.
- **P1 — High:** broken critical workflows, incorrect financial calculations, failed persistence, severe integration failures, or major data integrity problems.
- **P2 — Medium:** significant feature failures, inconsistent analytics, broken filtering, or important reliability issues.
- **P3 — Low:** minor UI issues, noncritical accessibility problems, or limited edge-case defects.

For every confirmed defect:

1. Record the reproduction steps.
2. Identify the root cause.
3. Add or improve a regression test.
4. Implement the smallest safe fix.
5. Run the relevant test suite.
6. Run affected integration and end-to-end tests.
7. Verify no unrelated functionality regressed.

Do not silently change business rules to make a test pass.

If expected business behavior is ambiguous, document the ambiguity and ask for clarification before making a consequential change.

Do not claim that all defects have been fixed unless the corresponding retests have passed.

---

## 18. Phase Fifteen — Final Validation

After the fixes and mock cleanup, rerun the relevant checks from a clean, reproducible state.

At minimum, validate:

- Installation and workspace consistency.
- Type checks.
- Linting.
- Unit tests.
- Critical integration tests.
- Database migrations.
- Critical end-to-end workflows.
- OCR pipeline tests.
- Authentication and authorization.
- Financial calculation correctness.
- Production build.
- Runtime mock isolation.
- Seeder and reference-data behavior.
- Security and dependency checks.
- Relevant performance tests.
- CI execution where available.

Compare the final results against the original baseline.

Ensure that removing mock providers did not break development or test configuration and that test infrastructure itself does not introduce fake data into production.

A successful build is not equivalent to a successful application. A passing unit test suite is not equivalent to successful end-to-end integration.

---

## 19. Reporting Requirements

Produce a final report in Markdown, saved in the repository using an appropriate documentation path such as `docs/qa/`, after checking existing documentation conventions.

Do not overwrite an existing audit report without authorization.

The report must contain the following sections.

### A. Executive Summary

- Overall quality assessment.
- Critical risks.
- Number of tests executed and their outcomes.
- Main defects discovered and resolved.
- Remaining blockers.
- Whether the application is ready for further staging validation.

### B. Verified Architecture

Document the actual frontend, backend, database, OCR, market-data, and external integration architecture.

### C. Baseline Results

Include commands executed and their original outcomes.

### D. Test Coverage Inventory

List unit, component, integration, contract, end-to-end, security, performance, and accessibility tests that exist and those added.

### E. Execution Results

Report actual passed, failed, blocked, skipped, and not-applicable results.

Separate test counts by suite. Do not combine different statuses into a misleading total.

### F. Business Workflow Validation

Summarize the result of each critical user journey.

### G. Financial Calculation Validation

Document formulas, independent expected values, edge cases, and any remaining uncertainties.

### H. OCR Validation

Document pipeline coverage, status transitions, failure scenarios, and persistence verification.

### I. Mock Inventory and Cleanup

List removed runtime mocks, isolated development mocks, retained test mocks, and unresolved dependencies on mock data.

### J. Seeder and Demo Data Inventory

List removed, retained, isolated, and unresolved seeders, with justification.

### K. Security Findings

Report confirmed vulnerabilities, severity, remediation, and remaining exposure.

### L. Performance and Accessibility

Report actual measurements, test conditions, limitations, and unresolved issues.

### M. Defect Register

For each defect include severity, reproduction steps, root cause, fix, regression test, and retest result.

### N. Commands and Reproducibility

Provide the actual commands required to run the relevant checks locally and in CI.

Redact secrets and avoid commands that could destroy non-test data.

### O. Remaining Risks and Blockers

Clearly identify anything not verified because of missing services, unavailable credentials, missing sandbox environments, or incomplete implementations.

### P. Final Readiness Verdict

Choose exactly one:

- `READY FOR STAGING VALIDATION`
- `NOT READY — CRITICAL OR HIGH-SEVERITY ISSUES REMAIN`
- `NOT FULLY VERIFIED — REQUIRED ENVIRONMENTS OR INTEGRATIONS ARE BLOCKED`

Do not label the application production-ready merely because all locally executable tests pass.

---

## 20. Final Execution Instructions

Proceed autonomously through repository discovery, baseline testing, test implementation, defect correction, runtime mock cleanup, safe seeder cleanup, and final validation.

Do not stop after producing a plan. Execute the work that can be safely completed in the current environment.

Use incremental changes and preserve a clear audit trail.

Before deleting any ambiguous seeder, shared fixture, or existing demo data in a persistent database, stop and report the proposed action instead of guessing.

If a test cannot be executed, state exactly why. If a feature does not exist, report it as missing rather than inventing an implementation.

**The work is complete only when the test results are reproducible, critical user workflows have been validated against real application services and persistence, unintended runtime mock behavior has been eliminated, obsolete demo-data initialization has been safely removed, and the remaining limitations are explicitly documented.**

Begin by inspecting the repository and establishing the baseline. Do not modify or delete files before understanding their role.