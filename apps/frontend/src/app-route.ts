import { formatSubmissionDate, submissionDayFromDate } from "./submission-date";

export type Page = "calendar" | "detail" | "upload" | "review";

export type AppRoute = {
  page: Page;
  selectedDay: number;
  submissionDate: string;
};

export const calendarYear = 2026;
export const calendarMonth = 5;
export const todaySubmissionDate = formatSubmissionDate(calendarYear, calendarMonth, 17);

export const defaultAppRoute: AppRoute = {
  page: "calendar",
  selectedDay: 17,
  submissionDate: todaySubmissionDate
};

export function formatAppRouteHash(route: AppRoute): string {
  if (route.page === "calendar") {
    return "#/calendar";
  }

  if (route.page === "detail") {
    return `#/detail/${route.selectedDay}`;
  }

  return `#/${route.page}/${route.submissionDate}`;
}

export function parseAppRouteHash(hash: string): AppRoute {
  const [page, value] = hash.replace(/^#\/?/, "").split("/");

  if (page === "calendar" || page === "") {
    return defaultAppRoute;
  }

  if (page === "detail") {
    const selectedDay = parseCalendarDay(value);

    if (selectedDay === null) {
      return defaultAppRoute;
    }

    return {
      page,
      selectedDay,
      submissionDate: formatSubmissionDate(calendarYear, calendarMonth, selectedDay)
    };
  }

  if (page === "upload" || page === "review") {
    if (!isSubmissionDate(value)) {
      return defaultAppRoute;
    }

    return routeFromSubmissionDate(page, value, defaultAppRoute.selectedDay);
  }

  return defaultAppRoute;
}

export function routeFromSubmissionDate(page: Extract<Page, "upload" | "review">, submissionDate: string, fallbackDay: number): AppRoute {
  return {
    page,
    selectedDay: submissionDayFromDate(submissionDate, calendarYear, calendarMonth, fallbackDay),
    submissionDate
  };
}

function parseCalendarDay(value: string | undefined): number | null {
  if (!value || !/^\d{1,2}$/.test(value)) {
    return null;
  }

  const day = Number(value);
  return day >= 1 && day <= 31 ? day : null;
}

function isSubmissionDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
