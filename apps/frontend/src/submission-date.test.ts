import { describe, expect, it } from "vitest";
import { formatSubmissionDate, submissionDayFromDate } from "./submission-date";

describe("formatSubmissionDate", () => {
  it("formats a calendar day for the date input", () => {
    expect(formatSubmissionDate(2026, 5, 12)).toBe("2026-05-12");
  });
});

describe("submissionDayFromDate", () => {
  it("returns the day when the date belongs to the visible calendar month", () => {
    expect(submissionDayFromDate("2026-05-17", 2026, 5)).toBe(17);
  });

  it("keeps the current selected day when the date is outside the visible calendar month", () => {
    expect(submissionDayFromDate("2026-04-30", 2026, 5, 17)).toBe(17);
  });
});
