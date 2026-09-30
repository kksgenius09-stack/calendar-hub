const weeks = [
  [{d:30},{d:31},{d:1,events:[['팀 주간회의','yellow'],['프로젝트 점검','brown']]},{d:2,events:[['가족 일정','green']]},{d:3},{d:4,events:[['음력 반복 · 가족 생일','green'],['운동','yellow']]},{d:5}],
  [{d:6},{d:7,events:[['고객 미팅','yellow']]},{d:8,events:[['병원 예약','green'],['온라인 강의','yellow']]},{d:9},{d:10,events:[['출장 준비','brown']]},{d:11,events:[['휴가','green']]},{d:12}],
  [{d:13},{d:14},{d:15,events:[['친구 모임','green']]},{d:16,events:[['업무 보고','brown'],['점심 약속','yellow']]},{d:17},{d:18},{d:19}],
  [{d:20},{d:21},{d:22},{d:23,events:[['추석 연휴','holiday']]},{d:24,events:[['추석 연휴','holiday']]},{d:25,events:[['추석 연휴','holiday']]},{d:26}],
  [{d:27},{d:28,events:[['여행 준비','yellow'],['가족 모임','green']]},{d:29},{d:30},{d:1},{d:2},{d:3}],
];

export default function DevPage() {
  return <main className="dev-page"><header className="dev-header"><div><span>온달력 테스트 환경</span><h1>2026년 9월</h1><p>샘플 데이터 전용 · 실제 캘린더와 연결되지 않습니다.</p></div><a href="/">운영 화면으로 이동</a></header><section className="dev-notice">이 화면에서 UI 변경사항을 먼저 확인하세요. 일정 저장·삭제·외부 캘린더 연결은 비활성화되어 있습니다.</section><section className="dev-calendar"><div className="dev-weekdays">{['일','월','화','수','목','금','토'].map(day=><b key={day}>{day}</b>)}</div><div className="dev-grid">{weeks.flat().map((cell,index)=><div className="dev-cell" key={`${cell.d}-${index}`}><span>{cell.d}</span>{cell.events?.map(([title,color])=><div className={`dev-event ${color}`} key={title}>{title}</div>)}</div>)}</div></section></main>;
}
