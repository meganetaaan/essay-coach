import type { ReviewStrictness } from "../../domain/review/review";
import type { EssaySubmission } from "../../domain/essay/essay-submission";
import type { EssayRepository } from "../ports/essay-repository";
import type { ObjectStorage } from "../ports/object-storage";
import type { ReviewJobQueue } from "../ports/review-job-queue";
import { createId } from "../../shared/ids";

export interface UploadEssaySubmissionInput {
  essayDayId: string;
  strictness: ReviewStrictness;
  contentType: string;
  body: Buffer;
}

export async function uploadEssaySubmission(
  input: UploadEssaySubmissionInput,
  deps: { essays: EssayRepository; storage: ObjectStorage; queue: ReviewJobQueue }
): Promise<EssaySubmission> {
  const essayDay = await deps.essays.findEssayDayById(input.essayDayId);
  if (!essayDay) throw new Error(`Essay day not found: ${input.essayDayId}`);

  const submissions = await deps.essays.listSubmissionsByEssayDay(input.essayDayId);
  const attemptNumber = submissions.length + 1;
  const extension = input.contentType === "image/png" ? "png" : "jpg";
  const stored = await deps.storage.putObject({
    key: `${essayDay.childId}/${essayDay.date}/attempt-${attemptNumber}.${extension}`,
    contentType: input.contentType,
    body: input.body
  });

  const submission: EssaySubmission = {
    id: createId("submission"),
    essayDayId: input.essayDayId,
    attemptNumber,
    strictness: input.strictness,
    imageObjectKey: stored.objectKey,
    reviewStatus: "queued",
    submittedAt: new Date()
  };

  await deps.essays.saveSubmission(submission);
  await deps.queue.enqueue({ submissionId: submission.id });
  return submission;
}
