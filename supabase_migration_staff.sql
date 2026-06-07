-- ============================================================================
-- MIGRATION: Système d'accès Staff au Scanner
-- Date: 2026-06-07
-- Description: Ajoute la gestion des staffs par événement
-- ============================================================================

-- 1. Ajouter la colonne staff_code à la table events
ALTER TABLE events ADD COLUMN IF NOT EXISTS staff_code TEXT UNIQUE;

-- 2. Générer un code staff pour tous les événements existants
-- Format: TK-XXXX (6 chars alphanumériques)
UPDATE events
SET staff_code = 'TK-' || upper(substr(md5(random()::text || id::text), 1, 4))
WHERE staff_code IS NULL;

-- 3. Rendre la colonne NOT NULL après avoir peuplé les existants
-- (Commenté car les futures insertions depuis le web devront gérer ça)
-- ALTER TABLE events ALTER COLUMN staff_code SET NOT NULL;

-- 4. Créer la table event_staff
CREATE TABLE IF NOT EXISTS event_staff (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  suspended_at TIMESTAMPTZ,
  UNIQUE(event_id, user_id)
);

-- 5. Activer RLS
ALTER TABLE event_staff ENABLE ROW LEVEL SECURITY;

-- 6. Policies RLS

-- Staff peut lire ses propres accès
CREATE POLICY "staff_read_own" ON event_staff
  FOR SELECT USING (auth.uid() = user_id);

-- Staff peut s'inscrire (INSERT) — nécessaire pour le upsert lors de la connexion
CREATE POLICY "staff_insert_self" ON event_staff
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Organisateur peut tout gérer sur ses événements
CREATE POLICY "organizer_manage_select" ON event_staff
  FOR SELECT USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

CREATE POLICY "organizer_manage_update" ON event_staff
  FOR UPDATE USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

CREATE POLICY "organizer_manage_delete" ON event_staff
  FOR DELETE USING (
    event_id IN (SELECT id FROM events WHERE organizer_id = auth.uid())
  );

-- Admin peut tout voir et gérer
CREATE POLICY "admin_select_all" ON event_staff
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "admin_manage_all" ON event_staff
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 7. Index pour performances
CREATE INDEX IF NOT EXISTS idx_event_staff_event_id ON event_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_event_staff_user_id ON event_staff(user_id);
CREATE INDEX IF NOT EXISTS idx_events_staff_code ON events(staff_code);

-- ============================================================================
-- VÉRIFICATION: Exécuter après migration
-- SELECT * FROM event_staff LIMIT 5;
-- SELECT id, title, staff_code FROM events LIMIT 10;
-- ============================================================================
