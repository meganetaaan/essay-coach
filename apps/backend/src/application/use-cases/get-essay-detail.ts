import type { EssayRepository } from "../ports/essay-repository";
import type { ReviewRepository } from "../ports/review-repository";

export async function getEssayDetail(
  input: { essayDayId: string },
  deps: { essays: EssayRepository; reviews: ReviewRepository }
) {
  const essayDay = await deps.essays.findEssayDayById(input.essayDayId);
  if (!essayDay) throw new Error(`Essay day not found: ${input.essayDayId}`);
  const submissions = await deps.essays.listSubmissionsByEssayDay(input.essayDayId);
  const reviews = await Promise.all(submissions.map((submission) => deps.reviews.findBySubmissionId(submission.id)));
  return { essayDay, submissions, reviews: reviews.filter(Boolean) };
}
