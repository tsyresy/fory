// ============================================================================
// Edge Function: system-push-notify
// Sends push notifications to organizers for system events like new staff joining
// or event approval.
// 
// This is triggered via Supabase Database Webhooks.
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const record = payload.record || payload;
    const oldRecord = payload.old_record || null;
    const table = payload.table;

    if (!record || !table) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service role key to bypass RLS
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    let targetUserId = null;
    let pushTitle = "";
    let pushBody = "";
    let eventTitle = "";

    // ========================================================================
    // 1. SCENARIO: Nouveau Staff (Table: event_staff)
    // ========================================================================
    if (table === "event_staff") {
      // Get event info
      const { data: event } = await supabase
        .from("events")
        .select("title, organizer_id")
        .eq("id", record.event_id)
        .single();
      
      if (!event) throw new Error("Event not found");

      // Get staff profile info to show their name
      const { data: staffProfile } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", record.user_id)
        .single();

      const staffName = staffProfile?.full_name || "Un nouveau staff";

      targetUserId = event.organizer_id;
      eventTitle = event.title;
      pushTitle = `Nouvelle équipe pour ${event.title}`;
      pushBody = `${staffName} a rejoint votre équipe de scannage.`;
    } 
    
    // ========================================================================
    // 2. SCENARIO: Evénement Approuvé (Table: events)
    // ========================================================================
    else if (table === "events") {
      // Check if status changed to 'active' or 'approved'
      // Assuming 'status' is the column name for event status
      const newStatus = record.status || record.state;
      const oldStatus = oldRecord ? (oldRecord.status || oldRecord.state) : null;

      // Only notify if it just became active
      if (newStatus !== "active" || oldStatus === "active") {
        return new Response(JSON.stringify({ ok: true, reason: "Status unchanged or not active" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      targetUserId = record.organizer_id;
      eventTitle = record.title;
      pushTitle = `Événement Approuvé ✅`;
      pushBody = `Votre événement "${record.title}" est maintenant actif et prêt !`;
    } 
    
    // ========================================================================
    // UNKNOWN TABLE
    // ========================================================================
    else {
      return new Response(JSON.stringify({ ok: false, reason: "Unknown table" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========================================================================
    // SEND NOTIFICATION
    // ========================================================================
    
    if (!targetUserId) {
      return new Response(JSON.stringify({ ok: false, reason: "No target user" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get target user's push token
    const { data: profile } = await supabase
      .from("profiles")
      .select("push_token")
      .eq("id", targetUserId)
      .single();

    if (!profile || !profile.push_token) {
      return new Response(JSON.stringify({ ok: true, reason: "User has no push token" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prepare Expo push payload
    const notifications = [{
      to: profile.push_token,
      title: pushTitle,
      body: pushBody,
      sound: "default",
      data: {
        type: "system_alert",
        eventId: record.event_id || record.id,
      },
      channelId: "default",
      priority: "high",
    }];

    // Send via Expo Push API
    const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifications),
    });

    const pushResult = await pushResponse.json();

    return new Response(
      JSON.stringify({ ok: true, sent: 1, result: pushResult }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    console.error("system-push-notify error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
