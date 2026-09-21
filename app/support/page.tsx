import { LegalPage } from "@/app/components/legal-page";

export default function SupportPage() {
  return <LegalPage eyebrow="온달력 안내" title="고객지원 및 데이터 삭제" description="문의, 연결 해제, 계정 데이터 삭제 방법을 안내합니다." updatedAt="2026년 9월 21일">
    <section><h2>1. 고객지원</h2><p>기능 오류, 연결 문제, 개인정보 문의는 <a href="mailto:kksgenius2@gmail.com">kksgenius2@gmail.com</a>으로 보내 주세요. 사용한 브라우저, 문제가 발생한 시각과 화면을 함께 알려주면 더 빠르게 확인할 수 있습니다. 비밀번호, 앱 전용 암호, OAuth 토큰은 이메일에 적지 마세요.</p></section>
    <section><h2>2. 캘린더 연결 해제</h2><p>온달력의 캘린더 목록에서 연결 해제를 선택하면 저장된 해당 공급자의 연결정보가 삭제됩니다. 추가로 Google 계정의 제3자 앱 권한을 철회하거나 Apple 계정에서 온달력용 앱 전용 암호를 폐기할 수 있습니다.</p></section>
    <section><h2>3. 전체 데이터 삭제 요청</h2><ol><li>온달력 로그인에 사용한 이메일 주소로 <a href="mailto:kksgenius2@gmail.com?subject=온달력%20데이터%20삭제%20요청">kksgenius2@gmail.com</a>에 “온달력 데이터 삭제 요청”이라는 제목으로 메일을 보냅니다.</li><li>메일 본문에 로그인 이메일과 전체 삭제 요청이라는 내용을 적습니다. 비밀번호나 캘린더 인증정보는 보내지 않습니다.</li><li>운영자는 계정 보호를 위해 필요한 범위에서 본인 확인을 요청할 수 있습니다.</li></ol><p>본인 확인이 완료되면 법령상 보존 의무가 없는 Supabase 사용자 정보, Google·iCloud·CalDAV 연결정보, 음력 반복정보를 7일 이내 삭제하고 결과를 회신합니다.</p></section>
    <section><h2>4. 삭제되지 않는 외부 데이터</h2><p>외부 캘린더에 이미 생성된 일정은 온달력 계정 데이터를 삭제해도 Google, iCloud 또는 회사 캘린더에 남을 수 있습니다. 해당 일정은 각 외부 캘린더에서 직접 삭제해야 합니다. 공급자가 보관하는 로그인·접속 기록에도 각 공급자의 정책이 적용됩니다.</p></section>
    <section><h2>5. 처리 담당</h2><p>담당: 온달력 운영자<br/>이메일: <a href="mailto:kksgenius2@gmail.com">kksgenius2@gmail.com</a><br/>일반적인 답변 목표: 영업일 기준 3일 이내</p></section>
  </LegalPage>;
}
