import type { ReviewStrictness } from "../review/review";

export type ReviewJobStatus = "queued" | "processing" | "completed" | "failed";

export interface EssaySubmission {
  id: string;
  essayDayId: string;
  attemptNumber: number;
  strictness: ReviewStrictness;
  imageObjectKey: string;
  ocrText?: string;
  reviewStatus: ReviewJobStatus;
  submittedAt: Date;
}
