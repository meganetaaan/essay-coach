-- D1-compatible schema foundation for the current Essay Coach MVP tables.
-- This migration intentionally contains schema only. Do not add real data or secrets.

CREATE TABLE IF NOT EXISTS guardians (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY,
  guardian_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  grade INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_children_guardian_id ON children(guardian_id);

CREATE TABLE IF NOT EXISTS essay_days (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL,
  child_grade INTEGER NOT NULL,
  date TEXT NOT NULL,
  topic_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(child_id, date)
);

CREATE INDEX IF NOT EXISTS idx_essay_days_child_date ON essay_days(child_id, date);

CREATE TABLE IF NOT EXISTS essay_submissions (
  id TEXT PRIMARY KEY,
  essay_day_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL,
  strictness TEXT NOT NULL,
  image_object_key TEXT NOT NULL,
  ocr_text TEXT,
  review_status TEXT NOT NULL,
  submitted_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_essay_submissions_day_attempt
  ON essay_submissions(essay_day_id, attempt_number);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL UNIQUE,
  strictness TEXT NOT NULL,
  ocr_text TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  scores_json TEXT NOT NULL,
  topic_comment TEXT NOT NULL,
  strengths_json TEXT NOT NULL,
  improvement_points_json TEXT NOT NULL,
  rewrite_advice_json TEXT NOT NULL,
  child_friendly_comment TEXT NOT NULL,
  parent_summary TEXT NOT NULL,
  raw_output_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reviews_submission_id ON reviews(submission_id);
