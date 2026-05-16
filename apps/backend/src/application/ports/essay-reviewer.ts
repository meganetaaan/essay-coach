import type { EssayTopic } from "../../domain/essay/topics";
import type { ReviewScoreBreakdown, ReviewStrictness } from "../../domain/review/review";

export interface EssayReviewRequest {
  childGrade: number;
  essayDate: string;
  topic: EssayTopic;
  topicAdherenceRequired: false;
  strictness: ReviewStrictness;
  imageObjectKey: string;
  imageUrlOrPath: string;
}

export interface EssayReviewResult {
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
}

export interface EssayReviewer {
  reviewEssayImage(request: EssayReviewRequest): Promise<EssayReviewResult>;
}
