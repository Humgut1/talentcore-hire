-- =============================================
-- ATS 스키마 v3 — 오퍼 필드 + 스코어카드
-- =============================================

-- 오퍼 관련 필드 (applications 테이블에 추가)
ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS offer_status text CHECK (offer_status IN ('pending','accepted','rejected','withdrawn')),
  ADD COLUMN IF NOT EXISTS offered_salary text,
  ADD COLUMN IF NOT EXISTS offer_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS offer_responded_at timestamptz;

-- 면접 스코어카드
CREATE TABLE IF NOT EXISTS interview_scorecards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id uuid REFERENCES interviews(id) NOT NULL,
  interviewer_id uuid REFERENCES users(id) NOT NULL,
  overall_rating int CHECK (overall_rating BETWEEN 1 AND 5),
  strengths text,
  concerns text,
  recommendation text CHECK (recommendation IN ('strong_yes','yes','no','strong_no')),
  notes text,
  submitted_at timestamptz DEFAULT now(),
  UNIQUE(interview_id, interviewer_id)
);

ALTER TABLE interview_scorecards DISABLE ROW LEVEL SECURITY;
