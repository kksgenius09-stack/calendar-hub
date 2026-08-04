import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/app/lib/supabase/server";

type InstanceInput = { lunarYear:number; solarDate:string; providerEventId?:string; resourceUrl?:string };

export async function POST(request: NextRequest) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error:"auth_required" }, { status:401 });
  const body = await request.json();
  const instances = (body.instances || []) as InstanceInput[];
  if (!body.id || !body.title || !body.calendarId || !instances.length) return NextResponse.json({ error:"invalid_series" }, { status:400 });
  const { error } = await supabase.from("lunar_recurring_events").insert({
    id:body.id, user_id:user.id, source:body.source, calendar_id:body.calendarId, title:body.title,
    lunar_month:body.lunarMonth, lunar_day:body.lunarDay, is_leap_month:Boolean(body.isLeapMonth),
    all_day:Boolean(body.allDay), start_time:body.startTime || null, duration_minutes:body.durationMinutes || null,
    generated_through_year:Math.max(...instances.map(item=>item.lunarYear)),
  });
  if (error) return NextResponse.json({ error:"series_save_failed" }, { status:400 });
  const { error:instanceError } = await supabase.from("lunar_event_instances").insert(instances.map(item=>({
    series_id:body.id, user_id:user.id, lunar_year:item.lunarYear, solar_date:item.solarDate,
    provider_event_id:item.providerEventId || null, resource_url:item.resourceUrl || null,
  })));
  if (instanceError) { await supabase.from("lunar_recurring_events").delete().eq("id",body.id); return NextResponse.json({ error:"instance_save_failed" }, { status:400 }); }
  return NextResponse.json({ saved:true, seriesId:body.id });
}
