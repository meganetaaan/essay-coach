import type { Review } from "../../domain/review/review";

export interface ReviewRepository {
  findBySubmissionId(submissionId: string): Promise<Review | undefined>;
  save(review: Review): Promise<void>;
}
