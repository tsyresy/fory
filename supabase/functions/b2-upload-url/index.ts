// ============================================================================
// Edge Function: b2-upload-url
// Generates a presigned S3-compatible URL for uploading media to Backblaze B2
// 
// DEPLOY:
// supabase functions deploy b2-upload-url --no-verify-jwt
//
// SECRETS REQUIRED (set via Supabase Dashboard → Edge Functions → Secrets):
// - B2_APPLICATION_KEY_ID
// - B2_APPLICATION_KEY
// - B2_BUCKET_NAME
// - B2_REGION (e.g., eu-central-003)
// - IMAGEKIT_URL_ENDPOINT (e.g., https://ik.imagekit.io/your_id)
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2";
import { S3Client, PutObjectCommand } from "npm:@aws-sdk/client-s3@3";
import { getSignedUrl } from "npm:@aws-sdk/s3-request-presigner@3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Initialize S3 client for Backblaze B2
function getS3Client() {
  const region = Deno.env.get("B2_REGION") || "eu-central-003";
  return new S3Client({
    region,
    endpoint: `https://s3.${region}.backblazeb2.com`,
    credentials: {
      accessKeyId: Deno.env.get("B2_APPLICATION_KEY_ID")!,
      secretAccessKey: Deno.env.get("B2_APPLICATION_KEY")!,
    },
    forcePathStyle: true,
  });
}

// Allowed MIME types
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

// Max file sizes (in bytes)
const MAX_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024,   // 10 MB
  video: 50 * 1024 * 1024,   // 50 MB
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Verify authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Non autorisé" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Utilisateur non authentifié" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Parse request body
    const { eventId, fileName, contentType } = await req.json();

    if (!eventId || !fileName || !contentType) {
      return new Response(
        JSON.stringify({ error: "Paramètres manquants: eventId, fileName, contentType requis" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Validate content type
    if (!ALLOWED_TYPES.has(contentType)) {
      return new Response(
        JSON.stringify({ error: `Type de fichier non autorisé: ${contentType}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Verify user has access to this event (organizer or active staff)
    const { data: event } = await supabase
      .from("events")
      .select("id, organizer_id")
      .eq("id", eventId)
      .single();

    if (!event) {
      return new Response(
        JSON.stringify({ error: "Événement introuvable" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isOrganizer = event.organizer_id === user.id;

    if (!isOrganizer) {
      // Check if user is active staff
      const { data: staffEntry } = await supabase
        .from("event_staff")
        .select("id, status")
        .eq("event_id", eventId)
        .eq("user_id", user.id)
        .single();

      if (!staffEntry || staffEntry.status !== "active") {
        return new Response(
          JSON.stringify({ error: "Accès non autorisé à cet événement" }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 5. Generate presigned URL
    const bucketName = Deno.env.get("B2_BUCKET_NAME")!;
    const s3Client = getS3Client();

    // Sanitize filename
    const safeFileName = fileName.replace(/[^a-zA-Z0-9._\-\/]/g, "_");
    const fileKey = `chat/${eventId}/${Date.now()}_${safeFileName}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    // 6. Construct public URL via ImageKit
    const imageKitEndpoint = Deno.env.get("IMAGEKIT_URL_ENDPOINT") || "";
    const publicUrl = imageKitEndpoint
      ? `${imageKitEndpoint}/${fileKey}`
      : `https://s3.${Deno.env.get("B2_REGION")}.backblazeb2.com/${bucketName}/${fileKey}`;

    return new Response(
      JSON.stringify({
        uploadUrl,
        fileKey,
        publicUrl,
        expiresIn: 900,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("b2-upload-url error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erreur interne du serveur" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
