import type { EssayReviewResult } from "../../../application/ports/essay-reviewer";
import { validateReviewScores, type ReviewScoreBreakdown, type ReviewStrictness } from "../../../domain/review/review";

export class HermesReviewOutputParser {
  parse(output: string, strictness: ReviewStrictness): EssayReviewResult {
    const parsed = JSON.parse(extractJson(output)) as Partial<EssayReviewResult>;
    assertString(parsed.ocrText, "ocrText");
    assertNumber(parsed.totalScore, "totalScore");
    assertScores(parsed.scores);
    assertString(parsed.topicComment, "topicComment");
    assertStringArray(parsed.strengths, "strengths");
    assertStringArray(parsed.improvementPoints, "improvementPoints");
    assertStringArray(parsed.rewriteAdvice, "rewriteAdvice");
    assertString(parsed.childFriendlyComment, "childFriendlyComment");
    assertString(parsed.parentSummary, "parentSummary");

    validateReviewScores({
      strictness,
      scores: parsed.scores,
      totalScore: parsed.totalScore
    });

    return {
      ocrText: parsed.ocrText,
      totalScore: parsed.totalScore,
      scores: parsed.scores,
      topicComment: parsed.topicComment,
      strengths: parsed.strengths,
      improvementPoints: parsed.improvementPoints,
      rewriteAdvice: parsed.rewriteAdvice,
      childFriendlyComment: parsed.childFriendlyComment,
      parentSummary: parsed.parentSummary,
      rawOutput: output
    };
  }
}

function extractJson(output: string): string {
  const trimmed = output.trim();
  if (trimmed.startsWith("{")) return trimmed;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) throw new Error("Hermes output did not contain JSON");
  return trimmed.slice(start, end + 1);
}

function assertString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid Hermes output field: ${field}`);
}

function assertNumber(value: unknown, field: string): asserts value is number {
  if (!Number.isFinite(value)) throw new Error(`Invalid Hermes output field: ${field}`);
}

function assertStringArray(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
    throw new Error(`Invalid Hermes output field: ${field}`);
  }
}

function assertScores(value: unknown): asserts value is ReviewScoreBreakdown {
  if (!value || typeof value !== "object") throw new Error("Invalid Hermes output field: scores");
  const scores = value as Record<string, unknown>;
  for (const key of [
    "topicRelation",
    "taskUnderstanding",
    "structure",
    "specificity",
    "expression",
    "grammarAndNotation",
    "readerAwareness"
  ]) {
    assertNumber(scores[key], `scores.${key}`);
  }
}
