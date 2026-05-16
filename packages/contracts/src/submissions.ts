import type { ReviewStrictness } from "./reviews";

export type ReviewJobStatusDto = "queued" | "processing" | "completed" | "failed";

export interface EssaySubmissionDto {
  id: string;
  essayDayId: string;
  attemptNumber: number;
  strictness: ReviewStrictness;
  imageObjectKey: string;
  ocrText?: string;
  reviewStatus: ReviewJobStatusDto;
  submittedAt: string;
}
