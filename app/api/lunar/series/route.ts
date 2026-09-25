import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/app/lib/supabase/server";

type InstanceInput = { lunarYear:number; solarDate:string; providerEventId?:string; resourceUrl?:string };

async function authenticatedClient() {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET(request: NextRequest) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error:"auth_required" }, { status:401 });
  const providerEventId=request.nextUrl.searchParams.get("providerEventId");
  const resourceUrl=request.nextUrl.searchParams.get("resourceUrl");
  if (!providerEventId && !resourceUrl) {
    const { data: instances, error: instancesError } = await supabase
      .from("lunar_event_instances")
      .select("series_id,provider_event_id,resource_url")
      .eq("user_id", user.id);
    if (instancesError) return NextResponse.json({ error:"series_lookup_failed" }, { status:500 });
    const seriesIds = [...new Set((instances || []).map(instance => instance.series_id))];
    if (!seriesIds.length) return NextResponse.json({ instances:[] });
    const { data: series, error: seriesError } = await supabase
      .from("lunar_recurring_events")
      .select("id,source,calendar_id")
      .eq("user_id", user.id)
      .in("id", seriesIds);
    if (seriesError) return NextResponse.json({ error:"series_lookup_failed" }, { status:500 });
    const seriesById = new Map((series || []).map(item => [item.id, item]));
    return NextResponse.json({ instances:(instances || []).flatMap(instance => {
      const parent = seriesById.get(instance.series_id);
      return parent ? [{ ...instance, source:parent.source, calendar_id:parent.calendar_id }] : [];
    }) });
  }
  let query=supabase.from("lunar_event_instances").select("series_id,lunar_year,solar_date,provider_event_id,resource_url").eq("user_id",user.id);
  query=providerEventId?query.eq("provider_event_id",providerEventId):query.eq("resource_url",resourceUrl!);
  const { data:matched }=await query.maybeSingle();
  if (!matched) return NextResponse.json({ series:null });
  const [{ data:series },{ data:instances }]=await Promise.all([
    supabase.from("lunar_recurring_events").select("id,source,calendar_id,title").eq("user_id",user.id).eq("id",matched.series_id).maybeSingle(),
    supabase.from("lunar_event_instances").select("lunar_year,solar_date,provider_event_id,resource_url").eq("user_id",user.id).eq("series_id",matched.series_id),
  ]);
  return NextResponse.json({ series:series?{...series,instances:instances||[]}:null });
}

export async function DELETE(request: NextRequest) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error:"auth_required" }, { status:401 });
  const body=await request.json();
  const scope=body.scope === "all" ? "all" : "single";
  if (!body.seriesId) return NextResponse.json({ error:"invalid_series" }, { status:400 });
  if (scope === "all") {
    const { error:instancesError }=await supabase.from("lunar_event_instances").delete().eq("user_id",user.id).eq("series_id",body.seriesId);
    if (instancesError) return NextResponse.json({ error:"delete_failed" }, { status:400 });
    const { error:seriesError }=await supabase.from("lunar_recurring_events").delete().eq("user_id",user.id).eq("id",body.seriesId);
    if (seriesError) return NextResponse.json({ error:"delete_failed" }, { status:400 });
  } else {
    let query=supabase.from("lunar_event_instances").delete().eq("user_id",user.id).eq("series_id",body.seriesId);
    query=body.providerEventId?query.eq("provider_event_id",body.providerEventId):query.eq("resource_url",body.resourceUrl);
    const { error }=await query;
    if (error) return NextResponse.json({ error:"delete_failed" }, { status:400 });
  }
  return NextResponse.json({ deleted:true, scope });
}

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
