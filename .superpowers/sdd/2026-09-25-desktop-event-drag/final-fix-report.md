# Desktop event manipulation final fixes

Status: completed. No deployment performed.

## Changes

- The lunar-series API now exposes the signed-in user's occurrence identities with their series, source, and calendar IDs. Event loading attaches `repeatSeriesId` by provider ID or resource URL, scoped to source and calendar. Normal event objects remain unchanged.
- Drag target lookup now uses pointer coordinates against month day-cell rectangles when an event/preview overlay prevents a `[data-date]` ancestor from being found. Both pointer movement and release use this lookup.
- Resize handles are only rendered for eligible events; blocked events expose neither edge handle.
- All-day and timed draft conversion behavior and Google OAuth configuration were left unchanged.

## Verification

- Focused tests: `node --test tests/event-manipulation.test.mjs tests/calendar-ui-flow.test.mjs` — 42 passed.
- Full suite/build: `npm test` — build succeeded and 70 tests passed.
- Lint: `npm run lint` — passed.
- `git diff --check` — passed.

## Concern

The successful build still prints vinext's existing Node.js import and dynamic-route classification warnings; the build exits successfully. No task-specific test or lint failures remain.
