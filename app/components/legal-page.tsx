import Link from "next/link";
import type { ReactNode } from "react";

export function LegalPage({ eyebrow, title, description, updatedAt, children }: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return <main className="legal-main"><article className="legal-page">
    <header className="legal-header">
      <Link href="/" className="legal-brand"><span>온</span><b>온달력</b></Link>
      <p>{eyebrow}</p><h1>{title}</h1><em>{description}</em><small>최종 수정일 {updatedAt}</small>
    </header>
    <div className="legal-content">{children}</div>
    <footer className="legal-footer">
      <Link href="/privacy">개인정보처리방침</Link><Link href="/terms">이용약관</Link><Link href="/support">고객지원</Link><Link href="/">온달력으로 돌아가기</Link>
    </footer>
  </article></main>;
}
