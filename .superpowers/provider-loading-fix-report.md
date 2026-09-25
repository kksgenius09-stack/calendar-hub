# Provider loading fix report

## Diagnosis

The page loader treated thrown fetch/JSON errors as a disconnected provider with empty calendars/events. It also started each merge from `connected`/`configured` values captured by the initial `useCallback`, so failed provider reads could overwrite newer connection status. The loader had no request timeout, and `loading` was cleared only on the success path. Separately, Google event loading queried every calendar returned by CalendarList (up to 250), including calendars Google marks unselected, with up to 500 events per request.

## Changes

- Added provider-scoped result merging: successful connections refresh only their own calendars/events; explicit reconnect-required responses change only that provider's status and retain viewable event/calendar data; transport/HTTP failures preserve that provider's last-known state.
- Added 12-second abort timeouts to provider and lunar-series reads, and moved loading cleanup to `finally`.
- Google continues to return the complete calendar list but only requests events for selected calendars and the primary calendar. The range, event cap, OAuth scopes, and redirects are unchanged.
- Added regression tests for Google reconnect-required isolation, mixed success/failure reconciliation, Google calendar request selection, and bounded/loading cleanup behavior.

## Verification

- `npm run lint` — pass.
- `npm test` — pass: build succeeds and 86 tests pass.
- `git diff --check` — pass.
- Build still emits existing Vinext/Cloudflare compatibility notices for Node built-ins and route classification; the build exits successfully.

No deployment performed.
