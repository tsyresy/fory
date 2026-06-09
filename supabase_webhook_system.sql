-- ============================================================================
-- MIGRATION: Webhooks pour les notifications push systèmes
-- Exécuter dans le SQL Editor de Supabase Dashboard
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.notify_system_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  payload jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    payload := jsonb_build_object('record', row_to_json(NEW), 'table', TG_TABLE_NAME);
  ELSIF TG_OP = 'UPDATE' THEN
    payload := jsonb_build_object('record', row_to_json(NEW), 'old_record', row_to_json(OLD), 'table', TG_TABLE_NAME);
  END IF;

  PERFORM net.http_post(
    url := 'https://zbutquzauitayuvepgdk.supabase.co/functions/v1/system-push-notify'::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpidXRxdXphdWl0YXl1dmVwZ2RrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODUyNzk2OCwiZXhwIjoyMDk0MTAzOTY4fQ.54YjoW8SkP1GCvjci5WHQhhFcE6zRajTUVfgGNrPRp0'
    ),
    body := payload
  );
  RETURN NEW;
END;
$$;

-- 1. Trigger pour event_staff (Nouveau staff)
DROP TRIGGER IF EXISTS on_event_staff_insert ON public.event_staff;
CREATE TRIGGER on_event_staff_insert
  AFTER INSERT ON public.event_staff
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_system_push();

-- 2. Trigger pour events (Evénement approuvé)
DROP TRIGGER IF EXISTS on_events_update ON public.events;
CREATE TRIGGER on_events_update
  AFTER UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_system_push();

SELECT 'Webhooks system push notify créés avec succès ✅' AS status;
