import { describe, expect, it } from "vitest";
import { getSampleReview, sampleReviews, scoreTotalFromBreakdown } from "./sample-reviews";

describe("sample review demo data", () => {
  it("includes distinct strong, middle, and needs-work samples", () => {
    expect(sampleReviews.map((sample) => sample.id)).toEqual(["strong", "middle", "needs-work"]);
  });

  it("keeps each total score equal to the score breakdown sum", () => {
    for (const sample of sampleReviews) {
      expect(sample.review.totalScore).toBe(scoreTotalFromBreakdown(sample.review.scores));
    }
  });

  it("falls back to the first sample for an unknown id", () => {
    expect(getSampleReview("missing")).toBe(sampleReviews[0]);
  });
});
