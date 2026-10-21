# EUFORIA — DASHBOARD CUSTOMIZATION
## PHASE 06: WORKSPACE MANAGEMENT, LAYOUT COLLECTIONS & DASHBOARD TEMPLATES

### 1. ROLE AND OBJECTIVE

Act as a senior full-stack engineer, frontend architect, product designer, and QA engineer working on Euforia.

Audit the actual repository and verify the implementation of Phases 01–05. Then implement Phase 06 as a cohesive extension of the existing dashboard customization system.

The objective is to give each user a reliable way to organize multiple dashboard workspaces, maintain different analytical layouts, duplicate configurations, and start from reusable templates.

This is an implementation task. Do not stop after producing a plan or technical proposal. Inspect the code, implement the feature, test it, and report the actual results.

**Important:** This phase must extend existing layout and widget customization capabilities rather than creating a competing dashboard system.

### 2. MANDATORY REPOSITORY AUDIT

Before making changes, inspect:

- The dashboard route, page structure, and workspace architecture.
- The actual implementation of Phases 01–05.
- Existing layout creation, editing, persistence, and deletion logic.
- Existing widget registry and widget-configuration schema.
- Existing drag-and-drop or grid-layout mechanisms, if present.
- Existing dashboard templates and default layouts.
- Existing saved analytical views from Phase 03.
- Existing goal widgets from Phase 04.
- Existing analytics widgets and insights from Phase 05.
- User-preference storage and backend persistence.
- Existing authentication, ownership, validation, and authorization conventions.
- Existing responsive design and theme support.
- Existing tests and build commands.

Create a short internal audit of what is already implemented, what can be reused, and what is genuinely missing.

Do not assume previous phases are complete merely because they were requested. Do not claim that existing functionality works unless you verify it.

If the repository already supports a capability listed below, reuse and improve it only where necessary. Avoid duplicate models, routes, components, or persistence mechanisms.

### 3. CORE WORKSPACE CONCEPT

Introduce a clear distinction between the following concepts.

**A. Workspace**

A named dashboard environment that owns a specific dashboard layout and its widget configuration.

Examples:
- Trading Overview.
- Performance Analysis.
- Risk Review.
- Strategy Research.

These are illustrative examples, not mandatory predefined products.

**B. Layout**

The arrangement and presentation of widgets within a workspace, including supported grid positions, sizes, visibility, and ordering.

**C. Widget Configuration**

The settings of an individual widget, such as selected metrics, chart type, period, display options, or other properties already supported by Phase 02.

**D. Saved Analytical View**

A saved analytical context from Phase 03, including applicable filters or other supported analysis parameters.

A saved analytical view is not the same thing as a workspace or layout.

Do not merge these concepts into one ambiguous configuration object.

Define how workspaces reference layouts, widget configurations, and saved analytical views without duplicating state or creating inconsistent sources of truth.

### 4. WORKSPACE MANAGEMENT

Users should be able to:

- Create a workspace.
- Assign a unique name within the appropriate user scope.
- Edit its name and description if supported by the product conventions.
- Open and switch between workspaces.
- Duplicate an existing workspace.
- Set a default workspace.
- Archive or delete a workspace according to existing deletion conventions.
- Identify the currently active workspace.
- Restore the last active workspace when appropriate.
- View available workspaces in a compact selector or workspace-management interface.

Validate names and references. Avoid confusing duplicate names within the same user scope.

Define behavior when:
- No workspace exists.
- Only one workspace exists.
- The default workspace is deleted.
- The active workspace is archived.
- A workspace references a removed widget.
- A workspace contains a configuration from an older schema version.
- Workspace loading fails.

Ensure a user cannot access or modify another user's workspaces.

### 5. WORKSPACE DUPLICATION

Implement reliable workspace duplication.

When a workspace is duplicated:
- Create a new workspace identity.
- Preserve compatible layout settings.
- Preserve compatible widget configurations.
- Preserve supported widget visibility and ordering.
- Preserve compatible grid positions and dimensions.
- Apply a new name.
- Avoid sharing mutable configuration objects unintentionally.
- Do not copy another user's data or private references.
- Do not accidentally duplicate external side effects.
- Do not overwrite the source workspace.

Define whether a saved analytical view is copied by reference, duplicated, or omitted. Choose behavior consistent with the existing data model and document it.

Ensure edits to the duplicated workspace do not silently modify the original.

### 6. DASHBOARD TEMPLATES

Implement a template system that lets users initialize a workspace from a predefined or user-created template, provided this capability is not already implemented.

Support a small, useful set of built-in templates based on widgets that genuinely exist in Euforia.

Potential examples:
- General Trading Overview.
- Performance Analytics.
- Strategy Comparison.
- Risk and Trade Review.

Only include widgets that are actually registered and usable. Never create template references to nonexistent widget types.

Template requirements:
- Display a template name and concise description.
- Preview its intended widget arrangement where practical.
- Show which supported widgets it includes.
- Allow a user to create a new workspace from the template.
- Preserve compatible default widget settings.
- Handle unavailable or deprecated widget types safely.
- Ensure each created workspace has its own mutable configuration.

If user-created templates are supported, allow users to save a compatible workspace as a reusable template and create workspaces from it.

Clearly distinguish built-in templates from user-owned templates.

Do not overbuild a template marketplace, public sharing platform, or cross-user template directory.

### 7. LAYOUT MANAGEMENT

Reuse the existing layout system and its drag-and-drop behavior.

Where the current architecture supports these operations, allow users to:
- Reorder widgets.
- Resize supported widgets.
- Move widgets between available grid positions.
- Hide and show widgets.
- Reset a layout to its saved or default state.
- Save layout changes.
- Discard unsaved layout changes if the application has an established edit mode.

Preserve the existing responsive layout behavior.

Avoid implementing a second grid engine or drag-and-drop framework.

If layout editing is already functional, focus on connecting it correctly to individual workspaces and preventing cross-workspace configuration leakage.

### 8. WORKSPACE-SPECIFIC WIDGET CONFIGURATION

Each workspace must maintain its own widget configuration where supported.

For example, two workspaces may contain the same widget type but use different:
- Metrics.
- Chart types.
- Periods.
- Display settings.
- Widget visibility.
- Grid dimensions.
- Sorting options.

Ensure widget configuration is associated with the correct workspace and widget instance.

Use stable identifiers for widget instances rather than relying solely on widget type names or array positions.

When a widget is removed, renamed, or upgraded, handle existing workspace configurations safely.

Do not duplicate widget calculation logic or implement metric configuration controls that already exist in Phase 02.

### 9. WORKSPACE AND ANALYTICAL VIEW INTEGRATION

Integrate with saved analytical views without conflating the two concepts.

Define and implement the most appropriate behavior based on the existing product architecture.

For example:
- A workspace may optionally reference a default analytical view.
- A user may select another saved analytical view while using the same workspace.
- Switching workspaces must not unexpectedly overwrite saved analytical views.
- Applying an analytical view must not silently change the workspace's layout.
- A missing or deleted analytical view must not make the workspace unusable.

If the existing application treats filters as global user state, preserve that convention unless there is a clearly justified architectural requirement to change it.

Document the chosen behavior and add tests for it.

### 10. PERSISTENCE AND DATA MODEL

Inspect existing models and persistence services before creating new entities.

Design the smallest maintainable data model that supports the actual requirements.

Potential workspace fields:
- Workspace identifier.
- Owner or user identifier.
- Name.
- Description, if supported.
- Layout configuration reference or validated configuration.
- Default analytical-view reference, if supported.
- Default-workspace flag or equivalent user preference.
- Creation and update timestamps.
- Archive timestamp, if appropriate.
- Configuration schema version, if needed.

Potential template fields:
- Template identifier.
- Template owner or built-in classification.
- Name and description.
- Compatible layout definition.
- Compatible widget configurations.
- Configuration schema version.
- Creation and update timestamps, where appropriate.

Requirements:
- Follow existing migration and persistence conventions.
- Validate configuration payloads.
- Enforce ownership and authorization.
- Prevent cross-user reference leakage.
- Use transactions where multiple writes must remain consistent.
- Add appropriate indexes and constraints.
- Avoid storing unnecessary duplicate state.
- Handle schema upgrades safely.
- Preserve existing user preferences and dashboard data.

If the application uses local storage for non-sensitive UI preferences, follow the existing convention. Do not store credentials, tokens, or sensitive account data in local storage.

If a backend persistence mechanism exists, use it for durable user-owned workspaces rather than introducing unrelated client-only persistence.

### 11. WORKSPACE STATE AND ERROR HANDLING

Implement explicit and consistent handling for:
- Loading a workspace.
- Saving workspace changes.
- Switching workspaces.
- Duplicating a workspace.
- Creating from a template.
- Concurrent updates, if supported by the architecture.
- Network failure.
- Invalid or outdated configuration.
- Missing widget types.
- Deleted templates or saved views.
- Unauthorized access.

Prevent accidental data loss when switching workspaces with unsaved changes.

Use the existing application's confirmation dialogs, notifications, error boundaries, and mutation patterns.

Do not show a success message before the corresponding operation succeeds.

If optimistic updates are used, implement appropriate rollback behavior.

### 12. USER EXPERIENCE AND VISUAL DESIGN

Maintain Euforia's existing design system, theme tokens, typography, spacing, and responsive behavior.

The experience should include, where appropriate:
- A compact workspace selector.
- A clear active-workspace indicator.
- A workspace-management interface.
- A template-selection interface.
- Rename, duplicate, and delete/archive actions.
- A useful empty state.
- Clear save or unsaved-change feedback.
- Confirmation for destructive operations.
- Loading and error states.
- Accessible keyboard navigation and labels.

Avoid cluttering the dashboard header with too many controls.

Use existing modal, popover, dropdown, and command-menu components where suitable.

Do not redesign the entire dashboard or introduce arbitrary colors.

### 13. PERFORMANCE AND SECURITY

- Avoid loading all widget data for every workspace unnecessarily.
- Load the active workspace using existing query and caching conventions.
- Preserve cache consistency after workspace mutations.
- Avoid unnecessary full-page remounts when switching workspaces.
- Prevent state leakage between workspace instances.
- Validate layout and widget configuration on the server where applicable.
- Enforce ownership on every read and write.
- Avoid unsafe deserialization of arbitrary configuration objects.
- Do not allow workspace configuration to inject executable code or unsafe HTML.
- Keep TypeScript types strict.
- Avoid unnecessary dependencies and unrelated refactoring.

### 14. TESTING REQUIREMENTS

Add tests using the existing test infrastructure.

**Workspace lifecycle**
- Create a workspace.
- Rename a workspace.
- Switch workspaces.
- Duplicate a workspace.
- Set and restore the default workspace.
- Archive or delete a workspace.
- Handle deletion of the active or default workspace.

**Configuration isolation**
- Editing one workspace does not modify another.
- Widget settings remain associated with the correct workspace.
- Layout positions and visibility persist.
- Duplicated configurations are independently mutable.
- Invalid or deprecated widget configurations are handled safely.

**Template behavior**
- Create a workspace from each supported built-in template.
- Verify all referenced widgets exist.
- Verify template configurations are cloned safely.
- Verify unsupported widgets are handled without breaking the workspace.
- Verify user-created templates if implemented.

**Analytical views**
- Workspace switching preserves expected analytical-view behavior.
- Deleting a referenced analytical view does not break the workspace.
- Applying a view does not overwrite layout settings.

**Persistence and security**
- Workspace data survives reloads.
- Ownership and authorization are enforced.
- Cross-user access is rejected.
- Validation rejects malformed configurations.
- Failures do not leave inconsistent partial updates.

**UI and integration**
- Loading, empty, error, and unsaved-change states.
- Workspace selector behavior.
- Responsive and theme compatibility where supported.
- Cache invalidation and refresh behavior.

Run the relevant tests and quality checks. Fix regressions caused by this implementation.

### 15. STRICT SCOPE BOUNDARIES

This phase includes:
- Workspace creation and management.
- Workspace switching.
- Independent workspace configuration.
- Workspace duplication.
- Built-in dashboard templates.
- User-created templates only if appropriate to the existing architecture.
- Integration with existing widget layouts and saved analytical views.
- Reliable persistence and authorization.

This phase does NOT include:
- Public template marketplaces.
- Cross-user workspace sharing.
- Collaborative multi-user editing.
- AI-generated dashboard layouts.
- Predictive analytics.
- New trading or broker integrations.
- Order placement or execution.
- Reimplementation of Phases 01–05.
- Starting Phase 07.

### 16. IMPLEMENTATION WORKFLOW

Execute the following sequence:

1. Audit the repository and verify Phases 01–05.
2. Identify the existing workspace, layout, widget, and persistence mechanisms.
3. Document which capabilities can be reused and which are missing.
4. Define the minimal data model and configuration ownership rules.
5. Implement workspace lifecycle operations.
6. Implement independent configuration persistence and duplication.
7. Implement templates using existing registered widgets.
8. Integrate the workspace selector and management interface.
9. Integrate saved analytical views without duplicating their system.
10. Add validation, authorization, and error handling.
11. Add and run tests.
12. Run applicable linting, type checks, and builds.
13. Inspect changes for regressions and duplicate implementations.
14. Produce the final report.

Do not stop after producing a plan unless a genuine blocker prevents implementation.

### 17. DEFINITION OF DONE

Phase 06 is complete only when:
- Users can manage multiple workspaces.
- Workspace configurations remain independent.
- Workspace switching loads the correct layout and widget settings.
- Duplication does not share mutable state with the source.
- Built-in templates reference only valid widgets.
- Persistence and authorization follow existing conventions.
- Saved analytical views behave consistently with the documented design.
- Loading, error, and unsaved-change scenarios are handled.
- Relevant tests pass.
- Applicable quality checks pass.
- Existing dashboard functionality remains intact.
- Any incomplete functionality is documented honestly.

### 18. FINAL REPORT

Provide a technically precise completion report containing:

**A. Repository audit**
- Existing workspace and layout mechanisms.
- Verified status of Phases 01–05.
- Reusable components and missing prerequisites.

**B. Implemented functionality**
- Workspace lifecycle.
- Workspace switching.
- Duplication.
- Templates.
- Widget and layout configuration isolation.
- Saved analytical-view integration.

**C. Architecture and persistence**
- Files changed.
- Models, migrations, endpoints, services, and UI components.
- Configuration ownership and versioning strategy.

**D. Validation**
- Tests executed and results.
- Linting, type-checking, and build results.
- Checks that could not be run.

**E. Limitations**
- Unsupported capabilities.
- Known issues.
- Remaining technical debt.

**F. Phase status**
- Complete, partially complete, or blocked.
- Evidence supporting the stated status.

**G. Phase 07 readiness**
- List any remaining prerequisites.
- Do not start Phase 07.
- Do not claim readiness without implementation and validation evidence.

Implement Phase 06 now.
