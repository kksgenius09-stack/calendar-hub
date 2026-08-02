import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "OnCal — 나의 모든 일정을 한곳에",
  description: "개인, 공유, 회사 일정을 한 눈에 보는 통합 캘린더",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
