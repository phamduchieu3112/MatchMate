-- 007_court_numbers_and_match_edit.sql
-- Adds court_numbers (e.g. '6, 8') to public.matches and grants UPDATE on editable match fields.

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS court_numbers text
  CHECK (court_numbers IS NULL OR char_length(trim(court_numbers)) BETWEEN 1 AND 80);

-- Column-level grants for court_numbers and full host match editing
GRANT SELECT (court_numbers) ON public.matches TO anon;
GRANT INSERT (court_numbers) ON public.matches TO authenticated;
GRANT UPDATE (
  sport,
  title,
  starts_at,
  lock_at,
  location_name,
  map_url,
  level,
  fee_per_slot,
  max_slots,
  courts,
  court_numbers,
  cancel_cutoff_hours,
  hold_minutes,
  notes,
  court_fee_total,
  shuttle_fee_total
) ON public.matches TO authenticated;
