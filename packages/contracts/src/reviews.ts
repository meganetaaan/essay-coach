export type ReviewStrictness = "easy" | "hard";

export interface ReviewScoreBreakdownDto {
  topicRelation: number;
  taskUnderstanding: number;
  structure: number;
  specificity: number;
  expression: number;
  grammarAndNotation: number;
  readerAwareness: number;
}

export interface ReviewDto {
  id: string;
  submissionId: string;
  strictness: ReviewStrictness;
  ocrText: string;
  totalScore: number;
  scores: ReviewScoreBreakdownDto;
  topicComment: string;
  strengths: string[];
  improvementPoints: string[];
  rewriteAdvice: string[];
  childFriendlyComment: string;
  parentSummary: string;
  rawOutput: unknown;
  createdAt: string;
}
