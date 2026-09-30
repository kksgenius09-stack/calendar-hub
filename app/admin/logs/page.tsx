import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/app/lib/supabase/server";

const ADMINS = new Set(["kksgenius09@gmail.com", "kksgenius2@gmail.com"]);

export const dynamic = "force-dynamic";
export const revalidate = 0;

const seoulDayKey = (value: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(value));
  return `${parts.find(p => p.type === "year")?.value}-${parts.find(p => p.type === "month")?.value}-${parts.find(p => p.type === "day")?.value}`;
};
const addDaysToKey = (key: string, days: number) => {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

export default async function AdminLogsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email || !ADMINS.has(user.email.toLowerCase())) redirect("/");

  const { data: visits } = await supabase
    .from("usage_events")
    .select("user_id,user_label,created_at")
    .eq("event_name", "visit")
    .eq("success", true)
    .order("created_at", { ascending: true })
    .limit(5000);
  const visitDaysByUser = new Map<string, Set<string>>();
  const labelByUser = new Map<string, string>();
  for (const row of visits ?? []) {
    const day = seoulDayKey(row.created_at);
    const set = visitDaysByUser.get(row.user_id) ?? new Set<string>();
    set.add(day);
    visitDaysByUser.set(row.user_id, set);
    if (row.user_label) labelByUser.set(row.user_id, row.user_label);
  }
  const todayKey = seoulDayKey(new Date().toISOString());
  const last7Days = Array.from({ length: 7 }, (_, index) => addDaysToKey(todayKey, -index));
  const dau = [...visitDaysByUser.values()].filter(days => days.has(todayKey)).length;
  const wau = [...visitDaysByUser.values()].filter(days => last7Days.some(day => days.has(day))).length;
  const firstVisitByUser = new Map([...visitDaysByUser].map(([userId, days]) => [userId, [...days].sort()[0]]));
  const retention = (n: number) => {
    let eligible = 0, retained = 0;
    for (const [userId, firstDay] of firstVisitByUser) {
      const targetDay = addDaysToKey(firstDay, n);
      if (targetDay > todayKey) continue;
      eligible++;
      if (visitDaysByUser.get(userId)?.has(targetDay)) retained++;
    }
    return { eligible, retained, rate: eligible ? Math.round((retained / eligible) * 100) : 0 };
  };
  const d1 = retention(1);
  const d7 = retention(7);
  const d30 = retention(30);
  const currentStreak = (days: Set<string>) => {
    const sortedDesc = [...days].sort().reverse();
    if (!sortedDesc.length) return 0;
    let streak = 1;
    let cursor = sortedDesc[0];
    for (let index = 1; index < sortedDesc.length; index++) {
      const previousDay = addDaysToKey(cursor, -1);
      if (sortedDesc[index] !== previousDay) break;
      streak++;
      cursor = previousDay;
    }
    return streak;
  };
  const streaks = [...visitDaysByUser.entries()]
    .map(([userId, days]) => ({ userId, label: labelByUser.get(userId) ?? "익명", streak: currentStreak(days), lastVisit: [...days].sort().at(-1) ?? "" }))
    .filter(row => row.streak >= 2)
    .sort((a, b) => b.streak - a.streak)
    .slice(0, 20);

  const { data: logs } = await supabase
    .from("error_logs")
    .select("provider,action,stage,error_code,status_code,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: usage } = await supabase
    .from("usage_events")
    .select("user_id,user_label,event_name,provider,success,created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  const { data: connectionCounts } = await supabase.rpc("admin_connection_counts");
  const rows = logs ?? [];
  const usageRows = (usage ?? []).filter(row => row.user_id !== user.id);
  const connectedByProvider = Object.fromEntries((connectionCounts ?? []).filter(row => row.provider !== "total").map(row => [row.provider, Number(row.connected_users)]));
  const totalConnected = Number((connectionCounts ?? []).find(row => row.provider === "total")?.connected_users ?? 0);
  const connectedUsers = new Set<string>();
  const usageUsers = new Set(usageRows.map(row => row.user_id));
  const visitCounts = usageRows.filter(row => row.event_name === "visit" && row.success).reduce<Record<string, number>>((acc, row) => { acc[row.user_id] = (acc[row.user_id] ?? 0) + 1; return acc; }, {});
  const visitorUsers = Object.keys(visitCounts).length;
  const returningUsers = Object.values(visitCounts).filter(count => count >= 2).length;
  const returningRate = visitorUsers ? Math.round((returningUsers / visitorUsers) * 100) : 0;
  const createdUsers = new Set(usageRows.filter(row => row.event_name === "event_create" && row.success).map(row => row.user_id));
  const usageByProvider = usageRows.filter(row => row.event_name === "calendar_connect" && row.success).reduce<Record<string, number>>((acc, row) => { if (row.provider) acc[row.provider] = (acc[row.provider] ?? 0) + 1; return acc; }, {});
  const usageByEvent = usageRows.reduce<Record<string, number>>((acc, row) => { acc[row.event_name] = (acc[row.event_name] ?? 0) + 1; return acc; }, {});
  const byProvider = rows.reduce<Record<string, number>>((acc, row) => { acc[row.provider] = (acc[row.provider] ?? 0) + 1; return acc; }, {});

  return <main className="admin-page">
    <header className="admin-header"><div><p>온달력 운영 도구</p><h1>오류 로그</h1><span>일정 내용과 제목은 저장하지 않습니다.</span></div><a href="/">캘린더로 돌아가기</a></header>
    <section className="admin-summary"><div><b>{dau}</b><span>오늘 활성 사용자(DAU)</span></div><div><b>{wau}</b><span>최근 7일 활성 사용자(WAU)</span></div><div><b>{d1.rate}%</b><span>가입 다음 날 재방문율(D1) · {d1.retained}/{d1.eligible}</span></div><div><b>{d7.rate}%</b><span>7일 후 재방문율(D7) · {d7.retained}/{d7.eligible}</span></div><div><b>{d30.rate}%</b><span>30일 후 재방문율(D30) · {d30.retained}/{d30.eligible}</span></div><div><b>{totalConnected}</b><span>총 연결 사용자</span></div>{Object.entries(connectedByProvider).map(([provider, count]) => <div key={`connected-${provider}`}><b>{count}</b><span>{provider} 연결 사용자</span></div>)}<div><b>{usageUsers.size}</b><span>통계 기록 사용자</span></div><div><b>{createdUsers.size}</b><span>일정 등록 사용자</span></div><div><b>{visitorUsers}</b><span>전체 방문자</span></div><div><b>{returningUsers}</b><span>재방문 사용자</span></div><div><b>{returningRate}%</b><span>재방문율</span></div><div><b>{usageByEvent.visit ?? 0}</b><span>방문 이벤트</span></div><div><b>{usageByEvent.event_create ?? 0}</b><span>일정 등록 이벤트</span></div><div><b>{rows.length}</b><span>최근 오류 로그</span></div>{Object.entries(byProvider).map(([provider, count]) => <div key={provider}><b>{count}</b><span>{provider} 오류</span></div>)}</section>
    <section className="admin-table-wrap"><table><thead><tr><th>시간</th><th>서비스</th><th>동작</th><th>단계</th><th>오류 코드</th><th>상태</th></tr></thead><tbody>{rows.length ? rows.map((row, index) => <tr key={`${row.created_at}-${index}`}><td>{new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td><td>{row.provider}</td><td>{row.action}</td><td>{row.stage}</td><td>{row.error_code}</td><td>{row.status_code ?? "-"}</td></tr>) : <tr><td colSpan={6} className="admin-empty">기록된 오류가 없습니다.</td></tr>}</tbody></table></section>
    <h2 className="admin-section-title">사용자 활동</h2><section className="admin-table-wrap"><table><thead><tr><th>시간</th><th>사용자</th><th>행동</th><th>서비스</th><th>결과</th></tr></thead><tbody>{usageRows.length ? usageRows.map((row, index) => <tr key={`${row.created_at}-${index}`}><td>{new Date(row.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</td><td>{row.user_label ?? "익명"}</td><td>{row.event_name}</td><td>{row.provider ?? "-"}</td><td>{row.success ? "성공" : "실패"}</td></tr>) : <tr><td colSpan={5} className="admin-empty">기록된 활동이 없습니다.</td></tr>}</tbody></table></section>
    <h2 className="admin-section-title">사용자별 연속 방문일</h2><section className="admin-table-wrap"><table><thead><tr><th>사용자</th><th>연속 방문일</th><th>마지막 방문</th></tr></thead><tbody>{streaks.length ? streaks.map(row => <tr key={row.userId}><td>{row.label}</td><td>{row.streak}일</td><td>{row.lastVisit}</td></tr>) : <tr><td colSpan={3} className="admin-empty">2일 이상 연속 방문한 사용자가 없습니다.</td></tr>}</tbody></table></section>
  </main>;
}
