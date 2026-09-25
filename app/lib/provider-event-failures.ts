import type { CalendarProvider } from "./provider-loading";

export type ProviderEventFailureResponse = {
  status: number;
  body: {
    connected: boolean;
    configured?: boolean;
    calendars: [];
    events: [];
    error: "auth_required" | "reconnect_required" | "temporarily_unavailable";
  };
};

const authFailureCodes = new Set([
  "NOT_CONNECTED",
  "AUTH_REQUIRED",
  "INVALID_CREDENTIALS",
  "CALDAV_HTTP_401",
]);

export function providerEventFailure(
  _provider: CalendarProvider,
  configured: boolean | undefined,
  error: unknown,
): ProviderEventFailureResponse {
  const code = error instanceof Error ? error.message : "";
  const explicitlyUnauthenticated = authFailureCodes.has(code);
  const body: ProviderEventFailureResponse["body"] = {
    connected: !explicitlyUnauthenticated,
    calendars: [],
    events: [],
    error: explicitlyUnauthenticated
      ? code === "AUTH_REQUIRED" ? "auth_required" : "reconnect_required"
      : "temporarily_unavailable",
  };
  if (typeof configured === "boolean") body.configured = configured;

  return { status: explicitlyUnauthenticated ? 401 : 503, body };
}

export function providerWriteFailure(
  provider: CalendarProvider,
  error: unknown,
): { status: number; body: { error: "auth_required" | "reconnect_required" | "save_failed" } } {
  const failure = providerEventFailure(provider, undefined, error);
  return {
    status: failure.status,
    body: { error: failure.body.connected ? "save_failed" : failure.body.error },
  };
}
