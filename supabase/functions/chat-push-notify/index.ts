// ============================================================================
// Edge Function: chat-push-notify
// Sends push notifications to participants when a new chat message is sent.
// 
// This is triggered via a Supabase Database Webhook on INSERT to chat_messages.
// 
// DEPLOY:
// supabase functions deploy chat-push-notify --no-verify-jwt
//
// WEBHOOK SETUP (Supabase Dashboard → Database → Webhooks):
// - Table: chat_messages
// - Events: INSERT
// - Type: Supabase Edge Function
// - Function: chat-push-notify
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
    const message = payload.record || payload;

    if (!message || !message.event_id || !message.sender_id) {
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

    // 1. Find all participants of this event (organizer + active staff)
    const { data: event } = await supabase
      .from("events")
      .select("id, organizer_id, title")
      .eq("id", message.event_id)
      .single();

    if (!event) {
      return new Response(JSON.stringify({ ok: false, reason: "Event not found" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get active staff user IDs
    const { data: staffEntries } = await supabase
      .from("event_staff")
      .select("user_id")
      .eq("event_id", message.event_id)
      .eq("status", "active");

    const staffUserIds = (staffEntries || []).map((s: any) => s.user_id);
    
    // All participants = organizer + staff, minus the sender
    const allParticipants = [event.organizer_id, ...staffUserIds]
      .filter((id) => id !== message.sender_id);

    if (allParticipants.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0 }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get push tokens for all participants
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, push_token")
      .in("id", allParticipants)
      .not("push_token", "is", null);

    const tokens = (profiles || [])
      .map((p: any) => p.push_token)
      .filter(Boolean);

    if (tokens.length === 0) {
      return new Response(JSON.stringify({ ok: true, sent: 0, reason: "No push tokens" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Build notification content
    let body = message.content || "";
    if (message.media_type === "image") body = "📷 Photo";
    if (message.media_type === "video") body = "🎬 Vidéo";

    // 4. Send via Expo Push API
    const notifications = tokens.map((token: string) => ({
      to: token,
      title: `💬 ${event.title}`,
      body: `${message.sender_name}: ${body}`,
      sound: "default",
      data: {
        type: "chat_message",
        eventId: message.event_id,
        eventTitle: event.title,
      },
      channelId: "chat",
      priority: "high",
    }));

    // Expo push API supports batch sending
    const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(notifications),
    });

    const pushResult = await pushResponse.json();

    return new Response(
      JSON.stringify({ ok: true, sent: tokens.length, result: pushResult }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("chat-push-notify error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
