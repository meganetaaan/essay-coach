import type { ReviewRepository } from "../../application/ports/review-repository";
import type { Review, ReviewScoreBreakdown, ReviewStrictness } from "../../domain/review/review";
import { initializeSqliteDatabase, openSqliteDatabase, resolveSqlitePath } from "./sqlite-database";

type SqliteDatabase = ReturnType<typeof openSqliteDatabase>;

interface ReviewRow {
  id: string;
  submission_id: string;
  strictness: ReviewStrictness;
  ocr_text: string;
  total_score: number;
  scores_json: string;
  topic_comment: string;
  strengths_json: string;
  improvement_points_json: string;
  rewrite_advice_json: string;
  child_friendly_comment: string;
  parent_summary: string;
  raw_output_json: string;
  created_at: string;
}

export class SqliteReviewRepository implements ReviewRepository {
  private readonly db: SqliteDatabase;

  constructor(path = resolveSqlitePath()) {
    const resolvedPath = resolveSqlitePath(path);
    initializeSqliteDatabase(resolvedPath);
    this.db = openSqliteDatabase(resolvedPath);
  }

  async findBySubmissionId(submissionId: string): Promise<Review | undefined> {
    const row = this.db.prepare("SELECT * FROM reviews WHERE submission_id = ? LIMIT 1").get(submissionId);
    return row ? mapReview(row as ReviewRow) : undefined;
  }

  async save(review: Review): Promise<void> {
    try {
      this.db
        .prepare(`
          INSERT INTO reviews (
            id,
            submission_id,
            strictness,
            ocr_text,
            total_score,
            scores_json,
            topic_comment,
            strengths_json,
            improvement_points_json,
            rewrite_advice_json,
            child_friendly_comment,
            parent_summary,
            raw_output_json,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          review.id,
          review.submissionId,
          review.strictness,
          review.ocrText,
          review.totalScore,
          JSON.stringify(review.scores),
          review.topicComment,
          JSON.stringify(review.strengths),
          JSON.stringify(review.improvementPoints),
          JSON.stringify(review.rewriteAdvice),
          review.childFriendlyComment,
          review.parentSummary,
          JSON.stringify(review.rawOutput),
          review.createdAt.toISOString()
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new Error(`Review already exists for submission: ${review.submissionId}`);
      }
      throw error;
    }
  }
}

function mapReview(row: ReviewRow): Review {
  return {
    id: row.id,
    submissionId: row.submission_id,
    strictness: row.strictness,
    ocrText: row.ocr_text,
    totalScore: row.total_score,
    scores: JSON.parse(row.scores_json) as ReviewScoreBreakdown,
    topicComment: row.topic_comment,
    strengths: JSON.parse(row.strengths_json) as string[],
    improvementPoints: JSON.parse(row.improvement_points_json) as string[],
    rewriteAdvice: JSON.parse(row.rewrite_advice_json) as string[],
    childFriendlyComment: row.child_friendly_comment,
    parentSummary: row.parent_summary,
    rawOutput: JSON.parse(row.raw_output_json) as unknown,
    createdAt: new Date(row.created_at)
  };
}
