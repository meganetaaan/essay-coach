import type { EssayRepository } from "../../application/ports/essay-repository";
import type { Child } from "../../domain/child/child";
import type { EssayDay } from "../../domain/essay/essay-day";
import type { EssaySubmission, ReviewJobStatus } from "../../domain/essay/essay-submission";
import type { EssayTopic } from "../../domain/essay/topics";
import type { ReviewStrictness } from "../../domain/review/review";
import type { D1DatabaseLike, D1Result } from "./cloudflare-d1-types";

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

export class CloudflareD1EssayRepository implements EssayRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async ensureDefaultChildForGuardian(input: { guardianId: string; displayName?: string; grade?: number }): Promise<Child> {
    const existing = await this.db
      .prepare("SELECT id, display_name, grade FROM children WHERE guardian_id = ? ORDER BY updated_at ASC LIMIT 1")
      .bind(input.guardianId)
      .first();
    if (isChildRow(existing)) return { id: existing.id, displayName: existing.display_name, grade: existing.grade };

    const now = new Date().toISOString();
    const child = {
      id: await defaultChildIdForGuardian(input.guardianId),
      displayName: input.displayName ?? "デフォルト児童",
      grade: input.grade ?? 6
    };
    await this.db
      .prepare(
        `INSERT INTO guardians (id, display_name, updated_at)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at`
      )
      .bind(input.guardianId, null, now)
      .run();
    await this.db
      .prepare(
        `INSERT INTO children (id, guardian_id, display_name, grade, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           guardian_id = excluded.guardian_id,
           display_name = excluded.display_name,
           grade = excluded.grade,
           updated_at = excluded.updated_at`
      )
      .bind(child.id, input.guardianId, child.displayName, child.grade, now)
      .run();
    return child;
  }

  async findGuardianIdByChildId(childId: string): Promise<string | undefined> {
    const row = await this.db.prepare("SELECT guardian_id FROM children WHERE id = ? LIMIT 1").bind(childId).first();
    return isGuardianRow(row) ? row.guardian_id : undefined;
  }

  async findEssayDayByChildAndDate(childId: string, date: string): Promise<EssayDay | undefined> {
    const row = await this.db.prepare("SELECT * FROM essay_days WHERE child_id = ? AND date = ? LIMIT 1").bind(childId, date).first();
    return row ? mapEssayDay(row as EssayDayRow) : undefined;
  }

  async findEssayDayById(id: string): Promise<EssayDay | undefined> {
    const row = await this.db.prepare("SELECT * FROM essay_days WHERE id = ? LIMIT 1").bind(id).first();
    return row ? mapEssayDay(row as EssayDayRow) : undefined;
  }

  async saveEssayDay(day: EssayDay): Promise<void> {
    await this.db
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
      .bind(day.id, day.childId, day.childGrade, day.date, JSON.stringify(day.topic), day.createdAt.toISOString())
      .run();
  }

  async listEssayDaysForMonth(input: { childId: string; year: number; month: number }): Promise<EssayDay[]> {
    const prefix = `${input.year}-${String(input.month).padStart(2, "0")}`;
    const result = await this.db
      .prepare("SELECT * FROM essay_days WHERE child_id = ? AND date LIKE ? ORDER BY date ASC")
      .bind(input.childId, `${prefix}%`)
      .all<EssayDayRow>();
    return rows(result).map(mapEssayDay);
  }

  async listSubmissionsByEssayDay(essayDayId: string): Promise<EssaySubmission[]> {
    const result = await this.db
      .prepare("SELECT * FROM essay_submissions WHERE essay_day_id = ? ORDER BY attempt_number ASC")
      .bind(essayDayId)
      .all<EssaySubmissionRow>();
    return rows(result).map(mapSubmission);
  }

  async findSubmissionById(id: string): Promise<EssaySubmission | undefined> {
    const row = await this.db.prepare("SELECT * FROM essay_submissions WHERE id = ? LIMIT 1").bind(id).first();
    return row ? mapSubmission(row as EssaySubmissionRow) : undefined;
  }

  async saveSubmission(submission: EssaySubmission): Promise<void> {
    await this.db
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
      .bind(
        submission.id,
        submission.essayDayId,
        submission.attemptNumber,
        submission.strictness,
        submission.imageObjectKey,
        submission.ocrText ?? null,
        submission.reviewStatus,
        submission.submittedAt.toISOString()
      )
      .run();
  }

  async updateSubmission(submission: EssaySubmission): Promise<void> {
    const result = await this.db
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
      .bind(
        submission.essayDayId,
        submission.attemptNumber,
        submission.strictness,
        submission.imageObjectKey,
        submission.ocrText ?? null,
        submission.reviewStatus,
        submission.submittedAt.toISOString(),
        submission.id
      )
      .run();
    if (result.meta?.changes === 0) throw new Error(`Submission not found: ${submission.id}`);
  }
}

function rows<T>(result: D1Result<T>): T[] {
  return result.results ?? [];
}

function isChildRow(row: unknown): row is { id: string; display_name: string; grade: number } {
  return (
    typeof row === "object" &&
    row !== null &&
    typeof (row as { id?: unknown }).id === "string" &&
    typeof (row as { display_name?: unknown }).display_name === "string" &&
    typeof (row as { grade?: unknown }).grade === "number"
  );
}

function isGuardianRow(row: unknown): row is { guardian_id: string } {
  return typeof row === "object" && row !== null && typeof (row as { guardian_id?: unknown }).guardian_id === "string";
}

async function defaultChildIdForGuardian(guardianId: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(guardianId));
  return `child_${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16)}`;
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
