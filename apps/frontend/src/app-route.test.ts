import { describe, expect, it } from "vitest";
import {
  defaultAppRoute,
  formatAppRouteHash,
  parseAppRouteHash,
  routeFromSubmissionDate
} from "./app-route";

describe("formatAppRouteHash", () => {
  it("formats month-aware calendar, submissions, detail, upload, and review routes", () => {
    expect(
      formatAppRouteHash({
        page: "calendar",
        visibleYear: 2026,
        visibleMonth: 4,
        selectedDay: 17,
        submissionDate: "2026-04-17",
        calendarView: "grid"
      })
    ).toBe("#/calendar/2026/4/grid/17");
    expect(
      formatAppRouteHash({
        page: "calendar",
        visibleYear: 2026,
        visibleMonth: 4,
        selectedDay: 17,
        submissionDate: "2026-04-17",
        calendarView: "list"
      })
    ).toBe("#/calendar/2026/4/list/17");
    expect(
      formatAppRouteHash({
        page: "submissions",
        visibleYear: 2026,
        visibleMonth: 4,
        selectedDay: 17,
        submissionDate: "2026-04-17",
        calendarView: "grid"
      })
    ).toBe("#/submissions/2026/4/17");
    expect(
      formatAppRouteHash({
        page: "detail",
        visibleYear: 2026,
        visibleMonth: 4,
        selectedDay: 12,
        submissionDate: "2026-04-12",
        calendarView: "grid"
      })
    ).toBe("#/detail/2026-04-12");
    expect(formatAppRouteHash({ ...defaultAppRoute, page: "upload", selectedDay: 12, submissionDate: "2026-05-12" })).toBe(
      "#/upload/2026-05-12"
    );
    expect(formatAppRouteHash({ ...defaultAppRoute, page: "review", selectedDay: 12, submissionDate: "2026-05-12" })).toBe(
      "#/review/2026-05-12"
    );
  });
});

describe("parseAppRouteHash", () => {
  it("parses month-aware routes needed for browser back restoration", () => {
    expect(parseAppRouteHash("#/calendar/2026/4/list/17")).toEqual({
      ...defaultAppRoute,
      page: "calendar",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 17,
      submissionDate: "2026-04-17",
      calendarView: "list"
    });
    expect(parseAppRouteHash("#/submissions/2026/4/17")).toEqual({
      ...defaultAppRoute,
      page: "submissions",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 17,
      submissionDate: "2026-04-17"
    });
    expect(parseAppRouteHash("#/calendar/2026/4/list")).toEqual({
      ...defaultAppRoute,
      page: "calendar",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 1,
      submissionDate: "2026-04-01",
      calendarView: "list"
    });
    expect(parseAppRouteHash("#/submissions/2026/4")).toEqual({
      ...defaultAppRoute,
      page: "submissions",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 1,
      submissionDate: "2026-04-01"
    });
    expect(parseAppRouteHash("#/detail/2026-04-12")).toEqual({
      page: "detail",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 12,
      submissionDate: "2026-04-12",
      calendarView: "grid"
    });
    expect(parseAppRouteHash("#/upload/2026-05-12")).toEqual({
      ...defaultAppRoute,
      page: "upload",
      selectedDay: 12,
      submissionDate: "2026-05-12"
    });
    expect(parseAppRouteHash("#/review/2026-05-12")).toEqual({
      ...defaultAppRoute,
      page: "review",
      selectedDay: 12,
      submissionDate: "2026-05-12"
    });
    expect(parseAppRouteHash("#/upload/2026-04-30")).toEqual({
      ...defaultAppRoute,
      page: "upload",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 30,
      submissionDate: "2026-04-30"
    });
  });

  it("falls back to the default route for unknown or invalid hashes", () => {
    expect(parseAppRouteHash("")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/detail/2026-02-31")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/calendar/2026/13/grid")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/upload/not-a-date")).toEqual(defaultAppRoute);
    expect(parseAppRouteHash("#/review/2026-13-40")).toEqual(defaultAppRoute);
  });
});

describe("routeFromSubmissionDate", () => {
  it("derives the visible month and selected day from a submission date", () => {
    expect(routeFromSubmissionDate("review", "2026-04-30", defaultAppRoute)).toEqual({
      ...defaultAppRoute,
      page: "review",
      visibleYear: 2026,
      visibleMonth: 4,
      selectedDay: 30,
      submissionDate: "2026-04-30"
    });
  });
});
