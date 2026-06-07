-- ============================================================================
-- MIGRATION: Système de Chat Direct par Événement
-- Date: 2026-06-07
-- Description: Chat temps réel entre organisateur et staffs d'un événement
-- ============================================================================

-- 1. Table des messages du chat
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

  -- Au moins un contenu (texte ou média)
  CONSTRAINT chat_msg_has_content CHECK (content IS NOT NULL OR media_url IS NOT NULL)
);

-- 2. Table pour tracker les messages lus par utilisateur
CREATE TABLE IF NOT EXISTS chat_read_receipts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, user_id)
);

-- 3. Index de performance
CREATE INDEX IF NOT EXISTS idx_chat_messages_event_created 
  ON chat_messages(event_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender 
  ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_read_receipts_user 
  ON chat_read_receipts(user_id, event_id);

-- 4. Activer Realtime sur chat_messages
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;

-- 5. Activer RLS
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_read_receipts ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 6. RLS POLICIES — chat_messages
-- ============================================================================

-- Organisateur peut lire les messages de ses événements
CREATE POLICY "organizer_read_chat" ON chat_messages
  FOR SELECT USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

-- Staff actif peut lire les messages de son événement assigné
CREATE POLICY "staff_read_chat" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM event_staff 
      WHERE event_staff.event_id = chat_messages.event_id 
        AND event_staff.user_id = auth.uid()
        AND event_staff.status = 'active'
    )
  );

-- Organisateur peut envoyer des messages dans ses événements
CREATE POLICY "organizer_send_chat" ON chat_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

-- Staff actif peut envoyer des messages dans son événement
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

-- Admin peut tout lire (lecture seule)
CREATE POLICY "admin_read_chat" ON chat_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 7. RLS POLICIES — chat_read_receipts
-- ============================================================================

-- Chaque utilisateur peut lire et écrire ses propres receipts
CREATE POLICY "user_manage_own_receipts" ON chat_read_receipts
  FOR ALL USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Organisateur peut lire les receipts de ses événements (pour voir qui a lu)
CREATE POLICY "organizer_read_receipts" ON chat_read_receipts
  FOR SELECT USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

-- Admin peut lire tous les read receipts
CREATE POLICY "admin_read_receipts" ON chat_read_receipts
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ============================================================================
-- 8. PUSH TOKEN — Ajouter colonne push_token à profiles
-- ============================================================================
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS push_token TEXT;

-- ============================================================================
-- VÉRIFICATION: Exécuter après migration
-- SELECT * FROM chat_messages LIMIT 5;
-- SELECT * FROM chat_read_receipts LIMIT 5;
-- SELECT push_token FROM profiles WHERE push_token IS NOT NULL;
-- ============================================================================
