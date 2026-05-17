import { describe, expect, it } from "vitest";
import {
  defaultAppRoute,
  formatAppRouteHash,
  parseAppRouteHash,
  routeFromSubmissionDate
} from "./app-route";

describe("formatAppRouteHash", () => {
  it("formats calendar, detail, upload, and review routes", () => {
    expect(formatAppRouteHash({ page: "calendar", selectedDay: 17, submissionDate: "2026-05-17" })).toBe(
      "#/calendar"
    );
    expect(formatAppRouteHash({ page: "detail", selectedDay: 12, submissionDate: "2026-05-17" })).toBe(
      "#/detail/12"
    );
    expect(formatAppRouteHash({ page: "upload", selectedDay: 12, submissionDate: "2026-05-12" })).toBe(
      "#/upload/2026-05-12"
    );
    expect(formatAppRouteHash({ page: "review", selectedDay: 12, submissionDate: "2026-05-12" })).toBe(
      "#/review/2026-05-12"
    );
  });
});

describe("parseAppRouteHash", () => {
  it("parses routes needed for browser back restoration", () => {
    expect(parseAppRouteHash("#/detail/12")).toEqual({
      page: "detail",
      selectedDay: 12,
      submissionDate: "2026-05-12"
    });
    expect(parseAppRouteHash("#/upload/2026-05-12")).toEqual({
      page: "upload",
      selectedDay: 12,
      submissionDate: "2026-05-12"
    });
    expect(parseAppRouteHash("#/review/2026-05-12")).toEqual({
      page: "review",
      selectedDay: 12,
      submissionDate: "2026-05-12"
    });
    expect(parseAppRouteHash("#/upload/2026-04-30")).toEqual({
      page: "upload",
      selectedDay: 17,
      submissionDate: "2026-04-30"
    });
  });

  it("falls back to the default route for unknown or invalid hashes", () => {
    expect(parseAppRouteHash("")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/detail/99")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/upload/not-a-date")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/review/2026-13-40")).toEqual(defaultAppRoute);
  });
});

describe("routeFromSubmissionDate", () => {
  it("keeps the current selected day when an upload date is outside the visible month", () => {
    expect(routeFromSubmissionDate("review", "2026-04-30", 9)).toEqual({
      page: "review",
      selectedDay: 9,
      submissionDate: "2026-04-30"
    });
  });
});
