# 온달력 프로젝트 인수인계 백업

백업일: 2026-09-30 (Asia/Seoul)

## 프로젝트 위치

- 현재 작업 원본: `F:\개인\calendar-hub`
- 모바일 Expo 프로젝트: `F:\개인\calendar-hub\mobile`
- 기존 C 드라이브 폴더는 백업용이며, 현재 작업 기준은 F 드라이브입니다.
- 웹 프로젝트는 저장소 루트의 `app`, `db`, `drizzle`, `worker`, `public`, `tests` 등에 있습니다.

## 실행 방법

```powershell
F:
cd F:\개인\calendar-hub\mobile
npx expo start -c
```

`-c`는 Expo 캐시 초기화입니다. QR은 같은 네트워크의 휴대폰에서 Expo Go로 열 수 있습니다.

## 지금까지의 주요 요구사항

### 웹 캘린더

- 반응형 월간 달력: 브라우저 확대/축소에서도 날짜와 일정이 겹치지 않아야 함.
- 일정이 많으면 `+N개 더보기`로 표시.
- Google, iCloud, CalDAV/회사 캘린더의 읽기·쓰기 권한을 구분.
- 쓰기 권한이 있는 캘린더는 일정 추가·수정 시 저장 캘린더를 변경할 수 있어야 함.
- 내용/메모 입력을 추가하고 제목 입력폭과 동일하게 표시.
- 메모 텍스트 영역은 사용자가 크기 조절하지 못하도록 함.
- 관리자 페이지 `/admin/logs`: 오류 로그, 사용자 활동, 재방문 사용자 수, 한국 시간 표시.
- 고객지원 이메일은 `ondalcalendar@gmail.com`.
- 운영 배포 전 테스트 서버에서 확인하는 흐름을 유지.

### 모바일 앱

- Expo 기반 iOS/Android 공통 앱.
- 웹과 동일한 온달력 브랜드/로고/색상/캘린더 UI를 사용.
- iPhone·Android·태블릿 반응형.
- 위젯은 추후 2x4, 4x4 등 규격별로 구현.
- 광고를 넣을 수 있는 구조로 만들고, Plus 구매 시 광고 제거를 고려.
- 설정 화면에는 자동 동기화, 기본 저장 캘린더, 대한민국 음력, 도움말/약관/개인정보/고객지원/데이터 삭제를 포함.
- 일정 추가·수정 화면에 시작일/종료일, 종일, 시작/종료 시간, 반복, 메모, 장소, URL, 알림, 저장 캘린더가 있어야 함.
- 반복과 저장 캘린더 선택은 별도 팝업 또는 명확한 콤보 UI, 오른쪽 화살표.
- 권한 없는 일정은 저장/수정 버튼이 비활성화되어야 함.
- 날짜를 누르면 하단에 그 날짜의 일정이 나오고, 일정을 누르면 편집창.
- 화면을 아래로 당기면 강제 동기화.

## 현재 모바일 데이터 원칙

모바일은 웹 Supabase 세션/API의 일정 목록을 원본으로 사용하지 않고, 휴대폰에 등록된 캘린더를 원본으로 사용하도록 전환 중입니다.

- `expo-calendar/legacy`로 휴대폰 캘린더 권한 확인
- Google/iCloud/회사 캘린더를 휴대폰에 등록된 native calendar로 조회
- 일정 추가는 `Calendar.createEventAsync`
- 일정 수정은 `Calendar.updateEventAsync`
- 일정 삭제는 `Calendar.deleteEventAsync`
- 읽기 전용 캘린더는 변경 차단
- 휴대폰의 Google/iCloud 캘린더에 저장된 일정은 해당 제공자의 동기화 후 웹에서도 보임
- 모바일 시작 시 기존 Supabase 웹 세션은 로그아웃하도록 처리

## 최근 수정된 파일

- `mobile/src/calendar/native-calendar.ts`: native 캘린더 조회/추가/수정/삭제 adapter
- `mobile/src/calendar/CalendarScreen.tsx`: native 캘린더 조회 및 native 이벤트 저장 경로
- `mobile/src/app/App.tsx`: 휴대폰 캘린더 권한 onboarding, 권한 거부 시 설정 열기
- `mobile/src/auth/session.ts`: 기존 OAuth 세션 처리(현재 native-only 흐름에서는 일정 원본으로 사용하지 않음)
- `mobile/src/api/calendar-client.ts`: 기존 웹 API client(웹 연동 호환용으로 보존)

## 검증

현재 F 드라이브 모바일 프로젝트에서 다음 검사가 통과했습니다.

```text
npm run typecheck  성공
npm test          성공 (3개 통과)
```

## 알려진 확인 필요 항목

1. iOS 설정에서 캘린더 권한을 끈 뒤 앱 버튼을 누르면 `Linking.openSettings()`로 설정 화면을 열도록 처리했습니다.
2. 휴대폰 캘린더의 제공자별 색상과 읽기/쓰기 권한은 기기·계정 설정에 따라 달라질 수 있습니다.
3. 휴대폰에서 저장한 이벤트가 웹에 보이는 시점은 Google/iCloud/회사 캘린더의 동기화 주기에 좌우됩니다.
4. 실제 iOS/Android 기기에서 native create/update/delete를 각각 확인해야 합니다.
5. native recurrence(특히 매년 음력)와 알림은 현재 추가 검증이 필요합니다.

## 대화의 핵심 결론

사용자는 “모바일에서 웹 로그인 데이터가 아니라 휴대폰에 연결된 Google/iCloud/회사 캘린더만 사용하고, 모바일에서 직접 추가·수정·삭제한 내용이 원본 캘린더 동기화를 통해 웹에도 반영되게 해달라”고 요청했습니다.

