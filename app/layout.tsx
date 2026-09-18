import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "온달력 — 모든 달력을 한곳에",
  description: "Google, iCloud, 회사 일정과 대한민국 음력을 한곳에서 관리하는 통합 캘린더",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
