import { createEssayDay } from "../application/use-cases/create-essay-day";
import { getEssayDetail } from "../application/use-cases/get-essay-detail";
import { getMonthlyCalendar } from "../application/use-cases/get-monthly-calendar";
import { uploadEssaySubmission } from "../application/use-cases/upload-essay-submission";
import type { EssayRepository } from "../application/ports/essay-repository";
import type { EssayReviewer } from "../application/ports/essay-reviewer";
import type { ObjectStorage } from "../application/ports/object-storage";
import type { ReviewJobQueue } from "../application/ports/review-job-queue";
import type { ReviewRepository } from "../application/ports/review-repository";

export interface AppDependencies {
  essays: EssayRepository;
  reviews: ReviewRepository;
  queue: ReviewJobQueue;
  storage: ObjectStorage;
  reviewer: EssayReviewer;
}

export function createApp(deps: AppDependencies) {
  return {
    createEssayDay: (input: Parameters<typeof createEssayDay>[0]) => createEssayDay(input, deps),
    uploadEssaySubmission: (input: Parameters<typeof uploadEssaySubmission>[0]) => uploadEssaySubmission(input, deps),
    getMonthlyCalendar: (input: Parameters<typeof getMonthlyCalendar>[0]) => getMonthlyCalendar(input, deps),
    getEssayDetail: (input: Parameters<typeof getEssayDetail>[0]) => getEssayDetail(input, deps)
  };
}
