-- ============================================================================
-- MIGRATION COMPLÈTE: Chat + Push notifications
-- Exécuter dans le SQL Editor de Supabase Dashboard
-- https://supabase.com/dashboard/project/zbutquzauitayuvepgdk/sql/new
-- ============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. TABLES
-- ═══════════════════════════════════════════════════════════════════════════

-- Table des messages du chat
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('organizer', 'staff')),
  content TEXT,
  media_url TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  media_thumbnail TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chat_msg_has_content CHECK (content IS NOT NULL OR media_url IS NOT NULL)
);

-- Table pour tracker les messages lus
CREATE TABLE IF NOT EXISTS chat_read_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- Colonne push_token sur profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. INDEX
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_chat_messages_event_created 
  ON chat_messages(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender 
  ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_read_receipts_user 
  ON chat_read_receipts(user_id, event_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. REALTIME
-- ═══════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. RLS
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- chat_messages policies
CREATE POLICY "organizer_read_chat" ON chat_messages
  FOR SELECT USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

CREATE POLICY "staff_read_chat" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_staff 
      WHERE event_staff.event_id = chat_messages.event_id 
        AND event_staff.user_id = auth.uid()
        AND event_staff.status = 'active'
    )
  );

CREATE POLICY "organizer_send_chat" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

CREATE POLICY "staff_send_chat" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM event_staff 
      WHERE event_staff.event_id = chat_messages.event_id 
        AND event_staff.user_id = auth.uid()
        AND event_staff.status = 'active'
    )
  );

CREATE POLICY "admin_read_chat" ON chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- chat_read_receipts policies
CREATE POLICY "user_manage_own_receipts" ON chat_read_receipts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "organizer_read_receipts" ON chat_read_receipts
  FOR SELECT USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

CREATE POLICY "admin_read_receipts" ON chat_read_receipts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. WEBHOOK PUSH NOTIFICATIONS
-- ═══════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_chat_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://zbutquzauitayuvepgdk.supabase.co/functions/v1/chat-push-notify'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpidXRxdXphdWl0YXl1dmVwZ2RrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyNzk2OCwiZXhwIjoyMDk0MTAzOTY4fQ.54YjoW8SkP1GCvjci5WHQhhFcE6zRajTUVfgGNrPRp0'
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_chat_message_insert ON public.chat_messages;
CREATE TRIGGER on_chat_message_insert
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_chat_push();

-- ✅ Vérification
SELECT 'Migration complète + webhook créés avec succès ✅' AS status;
