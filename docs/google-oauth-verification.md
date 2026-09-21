# 온달력 Google OAuth 운영 전환·검증 가이드

이 문서는 Google Auth Platform에서 온달력의 게시 상태를 **In production**으로 전환하고 민감한 Calendar 범위 검증을 제출할 때 사용하는 운영 체크리스트다. 실제 Client ID와 Secret은 문서나 저장소에 기록하지 않는다.

## 공개 정보

- 앱 이름: `온달력`
- 홈페이지: `https://ondalcalendar.kr`
- 개인정보처리방침: `https://ondalcalendar.kr/privacy`
- 이용약관: `https://ondalcalendar.kr/terms`
- 고객지원 및 데이터 삭제: `https://ondalcalendar.kr/support`
- 사용자 지원 이메일: `kksgenius2@gmail.com`
- 개발자 연락처: `kksgenius2@gmail.com`

Google Auth Platform의 Branding 화면에 위 값을 동일하게 입력한다. 앱 홈페이지에서 정책 문서로 직접 이동할 수 있어야 하며, 모든 주소는 로그인하지 않은 상태에서도 열려야 한다.

## 요청하는 Google Calendar 범위와 사유

### 읽기

`https://www.googleapis.com/auth/calendar.readonly`

이용자가 연결한 Google 캘린더 목록과 일정을 온달력의 월·주·일 화면에 표시하고, 선택한 연도의 전체 일정 검색 결과를 제공하기 위해 필요하다. 온달력은 사용자가 요청한 기간의 일정을 Google Calendar에서 조회하며 일반 일정 원문을 자체 데이터베이스에 별도로 복제하지 않는다.

### 쓰기

`https://www.googleapis.com/auth/calendar.events`

이용자가 온달력에서 선택한 Google 캘린더에 일정을 생성·수정·삭제하고, 이용자가 직접 설정한 음력 반복 일정의 향후 발생분을 생성하기 위해 필요하다. 사용자의 명시적인 화면 조작 없이 임의의 일정을 만들거나 변경하지 않는다.

검증 화면의 범위 목록에는 실제 코드에서 요청하는 위 두 범위만 남긴다. 사용하지 않는 범위가 등록되어 있다면 제출 전에 제거한다.

## 사전 확인

- [ ] Google Search Console에서 `ondalcalendar.kr` 도메인 소유권을 확인한다.
- [ ] OAuth 동의 화면의 앱 이름, 로고, 홈페이지와 정책 URL이 온달력 공개 화면과 일치한다.
- [ ] 지원 이메일과 개발자 연락처가 `kksgenius2@gmail.com`으로 설정되어 있다.
- [ ] 승인된 JavaScript 원본에 `https://ondalcalendar.kr`이 있다.
- [ ] Supabase에서 안내하는 Google 콜백 주소가 승인된 리디렉션 URI에 정확히 등록되어 있다.
- [ ] 테스트 사용자 전용 제한을 해제하고 게시 상태를 **In production**으로 전환한다.
- [ ] OAuth Data Access 화면에는 `calendar.readonly`, `calendar.events`만 요청되어 있다.

## 검증 시연 영상

주소창과 클릭 결과가 보이도록 한 번에 녹화한다. 개인 일정이나 비밀값은 테스트 계정을 사용해 가린다.

1. 로그아웃 상태로 `https://ondalcalendar.kr` 랜딩을 연다.
2. 개인정보처리방침과 고객지원·데이터 삭제 페이지가 공개적으로 열리는 모습을 보여준다.
3. “Google로 시작하기”를 눌러 Google 로그인 화면으로 이동한다.
4. 브라우저 주소창, 온달력 앱 이름, 요청 권한이 보이는 동의 화면을 보여주고 승인한다.
5. 온달력으로 돌아와 Google 캘린더 목록과 기존 일정이 표시되는 모습을 보여준다.
6. 테스트 일정을 생성하고 Google Calendar에도 반영되었음을 확인한다.
7. 같은 일정을 수정한 뒤 삭제하고 양쪽 서비스의 결과를 확인한다.
8. 필요하면 음력 반복 일정을 만들어 향후 발생분이 생성되는 과정을 보여준다.
9. 온달력에서 Google 연결 해제를 실행한다.
10. `/privacy`와 `/support`에서 처리 정보와 전체 데이터 삭제 방법을 다시 보여준다.

완성된 영상은 YouTube에 **미등록**으로 올린다. 링크를 가진 검토자는 로그인 없이 영상을 볼 수 있어야 하며, 비공개로 설정하면 안 된다.

## 제출 순서

1. Google Auth Platform의 Branding, Audience, Data Access 설정을 모두 저장한다.
2. Audience에서 게시 상태를 **In production**으로 전환한다.
3. Verification Center 또는 **Prepare for verification**을 연다.
4. 공개 URL, 범위별 사용 사유, Search Console 소유권, 미등록 시연 영상 URL을 제출한다.
5. Google이 추가 질문을 보내면 실제 기능과 이 문서의 설명이 어긋나지 않도록 답변한다.

심사 중에도 사이트와 정책 URL을 계속 공개 상태로 유지한다. 기능이나 처리 방식이 바뀌면 정책과 시연 자료도 함께 갱신한다.
