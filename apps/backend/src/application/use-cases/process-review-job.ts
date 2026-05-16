import type { EssayRepository } from "../ports/essay-repository";
import type { EssayReviewer } from "../ports/essay-reviewer";
import type { ObjectStorage } from "../ports/object-storage";
import type { ReviewJobQueue } from "../ports/review-job-queue";
import type { ReviewRepository } from "../ports/review-repository";
import { validateReviewScores, type Review } from "../../domain/review/review";
import { createId } from "../../shared/ids";

export async function processReviewJob(deps: {
  essays: EssayRepository;
  reviews: ReviewRepository;
  queue: ReviewJobQueue;
  storage: ObjectStorage;
  reviewer: EssayReviewer;
}): Promise<{ processed: boolean; submissionId?: string }> {
  const job = await deps.queue.pickNext();
  if (!job) return { processed: false };

  try {
    const submission = await deps.essays.findSubmissionById(job.submissionId);
    if (!submission) throw new Error(`Submission not found: ${job.submissionId}`);
    const essayDay = await deps.essays.findEssayDayById(submission.essayDayId);
    if (!essayDay) throw new Error(`Essay day not found: ${submission.essayDayId}`);
    if (await deps.reviews.findBySubmissionId(submission.id)) {
      throw new Error(`Review already exists for submission: ${submission.id}`);
    }

    const imageUrlOrPath = await deps.storage.getReadableUrlOrPath(submission.imageObjectKey);
    const result = await deps.reviewer.reviewEssayImage({
      childGrade: essayDay.childGrade,
      essayDate: essayDay.date,
      topic: essayDay.topic,
      topicAdherenceRequired: false,
      strictness: submission.strictness,
      imageObjectKey: submission.imageObjectKey,
      imageUrlOrPath
    });
    validateReviewScores({ strictness: submission.strictness, scores: result.scores, totalScore: result.totalScore });

    const review: Review = {
      id: createId("review"),
      submissionId: submission.id,
      strictness: submission.strictness,
      ...result,
      createdAt: new Date()
    };
    await deps.reviews.save(review);
    await deps.essays.updateSubmission({ ...submission, ocrText: result.ocrText, reviewStatus: "completed" });
    await deps.queue.complete(job.id);
    return { processed: true, submissionId: submission.id };
  } catch (error) {
    await deps.queue.fail(job.id, error instanceof Error ? error : new Error(String(error)));
    throw error;
  }
}
