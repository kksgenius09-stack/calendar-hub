export type ConnectionErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_CREDENTIALS"
  | "PERMISSION_DENIED"
  | "INVALID_SERVER_URL"
  | "SERVER_UNREACHABLE"
  | "CALDAV_PATH_NOT_FOUND"
  | "NO_CALENDARS"
  | "TEMPORARY_ERROR";

export type ConnectionProvider = "icloud" | "caldav";
export type ConnectionStage = "validate" | "authenticate" | "discover" | "save";

export type ConnectionErrorPayload = {
  code: ConnectionErrorCode;
  title: string;
  message: string;
  action: string;
  detail: { provider: ConnectionProvider; stage: ConnectionStage; code: ConnectionErrorCode };
};

const guidance: Record<ConnectionErrorCode, Pick<ConnectionErrorPayload, "title" | "message" | "action">> = {
  AUTH_REQUIRED: {
    title: "로그인이 필요해요",
    message: "캘린더 서비스 인증이 필요합니다.",
    action: "계정 인증 정보를 확인하고 다시 연결해 주세요.",
  },
  INVALID_CREDENTIALS: {
    title: "인증 정보를 확인해 주세요",
    message: "계정 또는 앱 전용 암호가 올바르지 않습니다.",
    action: "인증 정보를 다시 확인한 뒤 연결해 주세요.",
  },
  PERMISSION_DENIED: {
    title: "접근 권한이 없어요",
    message: "서버가 이 계정의 캘린더 접근을 허용하지 않았습니다.",
    action: "계정 권한과 서버 설정을 확인해 주세요.",
  },
  INVALID_SERVER_URL: {
    title: "서버 주소를 확인해 주세요",
    message: "입력한 CalDAV 서버 주소를 사용할 수 없습니다.",
    action: "HTTPS를 사용하는 외부 접속 가능 서버 주소를 입력해 주세요.",
  },
  SERVER_UNREACHABLE: {
    title: "서버에 연결할 수 없어요",
    message: "CalDAV 서버에 도달하지 못했습니다.",
    action: "네트워크와 서버 주소를 확인한 뒤 다시 시도해 주세요.",
  },
  CALDAV_PATH_NOT_FOUND: {
    title: "CalDAV 경로를 찾을 수 없어요",
    message: "서버에서 계정 또는 캘린더 경로를 찾지 못했습니다.",
    action: "CalDAV 서버 주소가 올바른지 확인해 주세요.",
  },
  NO_CALENDARS: {
    title: "캘린더가 없어요",
    message: "이 계정에서 연결할 캘린더를 찾지 못했습니다.",
    action: "계정에 캘린더가 있는지 확인해 주세요.",
  },
  TEMPORARY_ERROR: {
    title: "연결 중 문제가 발생했어요",
    message: "연결을 완료하지 못했습니다.",
    action: "잠시 후 다시 시도해 주세요.",
  },
};

const networkCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

function exactInternalCode(provider: ConnectionProvider, stage: ConnectionStage, error: unknown): ConnectionErrorCode | undefined {
  if (!(error instanceof Error)) return undefined;

  const message = error.message;
  if (stage === "authenticate" && message === "AUTH_REQUIRED") return "AUTH_REQUIRED";
  if (stage === "authenticate" && message === "CALDAV_HTTP_401") return "INVALID_CREDENTIALS";
  if (provider === "caldav" && stage === "authenticate" && message === "CALDAV_HTTP_403") return "PERMISSION_DENIED";
  if (provider === "caldav" && stage === "discover" && (message === "CALDAV_HTTP_404" || message === "CALDAV_PRINCIPAL_NOT_FOUND")) {
    return "CALDAV_PATH_NOT_FOUND";
  }
  if (stage === "discover" && message === "NO_CALENDARS") return "NO_CALENDARS";
  if (provider === "caldav" && stage === "validate" && message === "INVALID_SERVER_URL") return "INVALID_SERVER_URL";
  return undefined;
}

function isKnownNetworkFailure(error: unknown): boolean {
  try {
    if (error instanceof TypeError && (error.message === "fetch failed" || error.message === "Failed to fetch")) return true;
    if (!(error instanceof Error)) return false;

    const candidate = error as { code?: unknown; cause?: unknown };
    const directCode = candidate.code;
    if (typeof directCode === "string" && networkCodes.has(directCode)) return true;

    const cause = candidate.cause;
    if (typeof cause !== "object" || cause === null) return false;
    const causeCode = (cause as { code?: unknown }).code;
    return typeof causeCode === "string" && networkCodes.has(causeCode);
  } catch {
    return false;
  }
}

export function connectionErrorGuidance(code: ConnectionErrorCode): Pick<ConnectionErrorPayload, "title" | "message" | "action"> {
  return guidance[code] ?? guidance.TEMPORARY_ERROR;
}

export function mapConnectionError(
  provider: ConnectionProvider,
  stage: ConnectionStage,
  error: unknown,
): ConnectionErrorPayload {
  let code: ConnectionErrorCode = "TEMPORARY_ERROR";
  try {
    code = exactInternalCode(provider, stage, error) ?? (isKnownNetworkFailure(error) ? "SERVER_UNREACHABLE" : "TEMPORARY_ERROR");
  } catch {
    code = "TEMPORARY_ERROR";
  }

  return {
    code,
    ...connectionErrorGuidance(code),
    detail: { provider, stage, code },
  };
}
