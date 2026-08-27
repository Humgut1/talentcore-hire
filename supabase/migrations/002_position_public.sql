-- =============================================
-- ATS 스키마 v2 — 공개 채용 공고 필드 추가
-- =============================================

ALTER TABLE positions
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS requirements text,
  ADD COLUMN IF NOT EXISTS application_deadline timestamptz,
  ADD COLUMN IF NOT EXISTS is_published boolean DEFAULT false;
