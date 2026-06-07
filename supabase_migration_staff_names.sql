-- ============================================================================
-- MIGRATION: Ajout du nom/email staff dans event_staff
-- Date: 2026-06-07
-- Description: Stocke le nom et email du staff directement dans event_staff
--              pour éviter les problèmes RLS lors de la lecture par l'organisateur
-- ============================================================================

-- 1. Ajouter les colonnes
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS staff_name TEXT;
ALTER TABLE event_staff ADD COLUMN IF NOT EXISTS staff_email TEXT;

-- 2. Peupler les existants depuis profiles (si possible)
UPDATE event_staff es
SET 
  staff_name = COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
  staff_email = u.email
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE es.user_id = u.id
  AND es.staff_name IS NULL;

-- ============================================================================
-- VÉRIFICATION:
-- SELECT id, staff_name, staff_email, status FROM event_staff LIMIT 10;
-- ============================================================================
