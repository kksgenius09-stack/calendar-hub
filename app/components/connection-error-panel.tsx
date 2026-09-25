"use client";

import { useState } from "react";

import type { ConnectionErrorPayload } from "../lib/connection-errors";

type ConnectionErrorPanelProps = {
  error: ConnectionErrorPayload;
  retrying: boolean;
  onRetry: () => void;
};

export function ConnectionErrorPanel({ error, retrying, onRetry }: ConnectionErrorPanelProps) {
  const [copyStatus, setCopyStatus] = useState("");
  const detail = `provider=${error.detail.provider}\nstage=${error.detail.stage}\ncode=${error.detail.code}`;

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(detail);
      setCopyStatus("복사했어요.");
    } catch {
      setCopyStatus("복사하지 못했어요.");
    }
  }

  return (
    <section className="connection-error" role="alert">
      <strong className="connection-error-title">{error.title}</strong>
      <p className="connection-error-message">{error.message}</p>
      <small className="connection-error-action">{error.action}</small>
      <button className="connection-error-retry" type="button" onClick={onRetry} disabled={retrying}>
        {retrying ? "다시 확인 중…" : "다시 시도"}
      </button>
      <details className="connection-error-details">
        <summary>상세 정보</summary>
        <pre>{detail}</pre>
        <button className="connection-error-copy" type="button" onClick={copyDetails}>복사</button>
        {copyStatus ? <span className="connection-error-copy-status" role="status">{copyStatus}</span> : null}
      </details>
    </section>
  );
}
