const sharp=require('sharp');
const input='C:/Users/kks95/AppData/Local/Temp/codex-clipboard-adb6a249-60ec-4aac-8014-86a8fe3c768a.png';
const output='public/ondalcalendar-promo-sample.png';
const rows=[207,226,246,302,322,342,366,403,423,443,480,500,520,558,578,703,723,743,763,783,823,843];
const clear=rows.map(y=>`<rect x="248" y="${y-1}" width="1580" height="20" fill="#fff"/>`).join('');
const bars=[
 ['#e0ad00',207,'팀 주간회의'],['#8d4b39',226,'프로젝트 점검'],['#36bb83',246,'운동'],
 ['#e0ad00',302,'고객 미팅'],['#36bb83',322,'가족 일정'],['#8d4b39',342,'출장 준비'],
 ['#36bb83',403,'병원 예약'],['#e0ad00',423,'온라인 강의'],['#36bb83',443,'친구 모임'],
 ['#8d4b39',480,'업무 보고'],['#36bb83',500,'음력 반복 · 가족 생일'],['#e0ad00',520,'점심 약속'],
 ['#d95768',558,'추석 연휴'],['#36bb83',703,'휴가'],['#e0ad00',723,'여행 준비'],
 ['#8d4b39',743,'프로젝트 작업'],['#36bb83',763,'개인 일정'],['#d95768',823,'개천절'],['#36bb83',843,'가족 모임']
];
const add=bars.map(([c,y,t])=>`<rect x="255" y="${y}" width="1570" height="18" rx="6" fill="${c}"/><text x="1040" y="${y+13}" text-anchor="middle" font-family="Arial, sans-serif" font-size="11" font-weight="600" fill="#fff">${t}</text>`).join('');
const svg=`<svg width="1844" height="894" xmlns="http://www.w3.org/2000/svg">${clear}${add}</svg>`;
sharp(input).composite([{input:Buffer.from(svg)}]).png().toFile(output).then(()=>console.log(output));
