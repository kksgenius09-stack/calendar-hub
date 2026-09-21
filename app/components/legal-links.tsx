export function LegalLinks({ compact = false }: { compact?: boolean }) {
  return <nav className={`public-legal-links${compact ? " compact" : ""}`} aria-label="서비스 정책">
    <a href="/privacy">개인정보처리방침</a>
    <a href="/terms">이용약관</a>
    <a href="/support">고객지원·데이터 삭제</a>
  </nav>;
}
