import type { EssayRepository } from "../../application/ports/essay-repository";
import type { EssayDay } from "../../domain/essay/essay-day";
import type { EssaySubmission, ReviewJobStatus } from "../../domain/essay/essay-submission";
import type { EssayTopic } from "../../domain/essay/topics";
import type { ReviewStrictness } from "../../domain/review/review";
import { initializeSqliteDatabase, openSqliteDatabase, resolveSqlitePath } from "./sqlite-database";

type SqliteDatabase = ReturnType<typeof openSqliteDatabase>;

interface EssayDayRow {
  id: string;
  child_id: string;
  child_grade: number;
  date: string;
  topic_json: string;
  created_at: string;
}

interface EssaySubmissionRow {
  id: string;
  essay_day_id: string;
  attempt_number: number;
  strictness: ReviewStrictness;
  image_object_key: string;
  ocr_text: string | null;
  review_status: ReviewJobStatus;
  submitted_at: string;
}

export class SqliteEssayRepository implements EssayRepository {
  private readonly db: SqliteDatabase;

  constructor(path = resolveSqlitePath()) {
    const resolvedPath = resolveSqlitePath(path);
    initializeSqliteDatabase(resolvedPath);
    this.db = openSqliteDatabase(resolvedPath);
  }

  async findEssayDayByChildAndDate(childId: string, date: string): Promise<EssayDay | undefined> {
    const row = this.db
      .prepare("SELECT * FROM essay_days WHERE child_id = ? AND date = ? LIMIT 1")
      .get(childId, date);
    return row ? mapEssayDay(row as EssayDayRow) : undefined;
  }

  async findEssayDayById(id: string): Promise<EssayDay | undefined> {
    const row = this.db.prepare("SELECT * FROM essay_days WHERE id = ? LIMIT 1").get(id);
    return row ? mapEssayDay(row as EssayDayRow) : undefined;
  }

  async saveEssayDay(day: EssayDay): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO essay_days (id, child_id, child_grade, date, topic_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          child_id = excluded.child_id,
          child_grade = excluded.child_grade,
          date = excluded.date,
          topic_json = excluded.topic_json,
          created_at = excluded.created_at
      `)
      .run(day.id, day.childId, day.childGrade, day.date, JSON.stringify(day.topic), day.createdAt.toISOString());
  }

  async listEssayDaysForMonth(input: { childId: string; year: number; month: number }): Promise<EssayDay[]> {
    const prefix = `${input.year}-${String(input.month).padStart(2, "0")}`;
    return this.db
      .prepare("SELECT * FROM essay_days WHERE child_id = ? AND date LIKE ? ORDER BY date ASC")
      .all(input.childId, `${prefix}%`)
      .map((row) => mapEssayDay(row as EssayDayRow));
  }

  async listSubmissionsByEssayDay(essayDayId: string): Promise<EssaySubmission[]> {
    return this.db
      .prepare("SELECT * FROM essay_submissions WHERE essay_day_id = ? ORDER BY attempt_number ASC")
      .all(essayDayId)
      .map((row) => mapSubmission(row as EssaySubmissionRow));
  }

  async findSubmissionById(id: string): Promise<EssaySubmission | undefined> {
    const row = this.db.prepare("SELECT * FROM essay_submissions WHERE id = ? LIMIT 1").get(id);
    return row ? mapSubmission(row as EssaySubmissionRow) : undefined;
  }

  async saveSubmission(submission: EssaySubmission): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO essay_submissions (
          id,
          essay_day_id,
          attempt_number,
          strictness,
          image_object_key,
          ocr_text,
          review_status,
          submitted_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          essay_day_id = excluded.essay_day_id,
          attempt_number = excluded.attempt_number,
          strictness = excluded.strictness,
          image_object_key = excluded.image_object_key,
          ocr_text = excluded.ocr_text,
          review_status = excluded.review_status,
          submitted_at = excluded.submitted_at
      `)
      .run(
        submission.id,
        submission.essayDayId,
        submission.attemptNumber,
        submission.strictness,
        submission.imageObjectKey,
        submission.ocrText ?? null,
        submission.reviewStatus,
        submission.submittedAt.toISOString()
      );
  }

  async updateSubmission(submission: EssaySubmission): Promise<void> {
    const result = this.db
      .prepare(`
        UPDATE essay_submissions
        SET essay_day_id = ?,
            attempt_number = ?,
            strictness = ?,
            image_object_key = ?,
            ocr_text = ?,
            review_status = ?,
            submitted_at = ?
        WHERE id = ?
      `)
      .run(
        submission.essayDayId,
        submission.attemptNumber,
        submission.strictness,
        submission.imageObjectKey,
        submission.ocrText ?? null,
        submission.reviewStatus,
        submission.submittedAt.toISOString(),
        submission.id
      );
    if (result.changes === 0) throw new Error(`Submission not found: ${submission.id}`);
  }
}

function mapEssayDay(row: EssayDayRow): EssayDay {
  return {
    id: row.id,
    childId: row.child_id,
    childGrade: row.child_grade,
    date: row.date,
    topic: JSON.parse(row.topic_json) as EssayTopic,
    createdAt: new Date(row.created_at)
  };
}

function mapSubmission(row: EssaySubmissionRow): EssaySubmission {
  return {
    id: row.id,
    essayDayId: row.essay_day_id,
    attemptNumber: row.attempt_number,
    strictness: row.strictness,
    imageObjectKey: row.image_object_key,
    ocrText: row.ocr_text ?? undefined,
    reviewStatus: row.review_status,
    submittedAt: new Date(row.submitted_at)
  };
}
