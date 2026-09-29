# OneCalendar Mobile

iPhone과 Android를 함께 지원하는 Expo 기반 모바일 앱입니다.

## 준비

1. `.env.example`을 `.env`로 복사합니다.
2. 웹 프로젝트와 같은 Supabase URL과 Publishable Key를 입력합니다.
3. Supabase Authentication의 Redirect URLs에 `ondalcalendar://auth/callback`을 추가합니다.

## 실행

```bash
npm install
npm start
```

Expo Go에서 QR 코드를 스캔하거나 Android/iOS 시뮬레이터를 선택할 수 있습니다.

## 현재 포함된 기능

- 로그인 없이 월간 달력 둘러보기
- Google OAuth 기반 OneCalendar 로그인과 Google 캘린더 동시 연결
- PC에서 연결한 Google, iCloud, 회사 CalDAV 일정 통합 조회
- 대한민국 음력 날짜 표시
- 날짜별 일정 및 다가오는 일정 보기
- 일정 등록 및 캘린더 선택
- 캘린더 연결 상태와 음력 표시 설정

캘린더 계정의 신규 연결과 암호 변경은 1차 버전에서 웹 설정을 사용합니다.
