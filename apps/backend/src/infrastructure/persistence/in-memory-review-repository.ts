import type { ReviewRepository } from "../../application/ports/review-repository";
import type { Review } from "../../domain/review/review";

export class InMemoryReviewRepository implements ReviewRepository {
  private readonly reviewsBySubmissionId = new Map<string, Review>();

  async findBySubmissionId(submissionId: string): Promise<Review | undefined> {
    return this.reviewsBySubmissionId.get(submissionId);
  }

  async save(review: Review): Promise<void> {
    if (this.reviewsBySubmissionId.has(review.submissionId)) {
      throw new Error(`Review already exists for submission: ${review.submissionId}`);
    }
    this.reviewsBySubmissionId.set(review.submissionId, review);
  }
}
