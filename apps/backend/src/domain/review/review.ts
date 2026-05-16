export type ReviewStrictness = "easy" | "hard";

export interface ReviewScoreBreakdown {
  topicRelation: number;
  taskUnderstanding: number;
  structure: number;
  specificity: number;
  expression: number;
  grammarAndNotation: number;
  readerAwareness: number;
}

export type ReviewRubric = ReviewScoreBreakdown;

export const EASY_REVIEW_RUBRIC: ReviewRubric = {
  topicRelation: 10,
  taskUnderstanding: 20,
  structure: 15,
  specificity: 20,
  expression: 15,
  grammarAndNotation: 10,
  readerAwareness: 10
};

export const HARD_REVIEW_RUBRIC: ReviewRubric = {
  topicRelation: 20,
  taskUnderstanding: 15,
  structure: 20,
  specificity: 15,
  expression: 10,
  grammarAndNotation: 10,
  readerAwareness: 10
};

export interface Review {
  id: string;
  submissionId: string;
  strictness: ReviewStrictness;
  ocrText: string;
  totalScore: number;
  scores: ReviewScoreBreakdown;
  topicComment: string;
  strengths: string[];
  improvementPoints: string[];
  rewriteAdvice: string[];
  childFriendlyComment: string;
  parentSummary: string;
  rawOutput: unknown;
  createdAt: Date;
}

export function getRubric(strictness: ReviewStrictness): ReviewRubric {
  return strictness === "easy" ? EASY_REVIEW_RUBRIC : HARD_REVIEW_RUBRIC;
}

export function rubricTotal(rubric: ReviewRubric): number {
  return Object.values(rubric).reduce((sum, value) => sum + value, 0);
}

export function scoreTotal(scores: ReviewScoreBreakdown): number {
  return Object.values(scores).reduce((sum, value) => sum + value, 0);
}

export function validateReviewScores(input: {
  strictness: ReviewStrictness;
  scores: ReviewScoreBreakdown;
  totalScore: number;
}): void {
  const rubric = getRubric(input.strictness);
  for (const [dimension, score] of Object.entries(input.scores) as Array<[keyof ReviewScoreBreakdown, number]>) {
    if (!Number.isFinite(score) || score < 0 || score > rubric[dimension]) {
      throw new Error(`Invalid score for ${dimension}: ${score} exceeds max ${rubric[dimension]}`);
    }
  }

  const computedTotal = scoreTotal(input.scores);
  if (input.totalScore !== computedTotal) {
    throw new Error(`Invalid total score: expected ${computedTotal}, got ${input.totalScore}`);
  }
}
