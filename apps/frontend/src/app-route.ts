import { formatSubmissionDate, submissionDayFromDate } from "./submission-date";

export type Page = "calendar" | "submissions" | "detail" | "upload" | "review";
export type CalendarView = "grid" | "list";

export type AppRoute = {
  page: Page;
  visibleYear: number;
  visibleMonth: number;
  selectedDay: number;
  submissionDate: string;
  calendarView: CalendarView;
};

export const calendarYear = 2026;
export const calendarMonth = 5;
export const todaySubmissionDate = formatSubmissionDate(calendarYear, calendarMonth, 17);

export const defaultAppRoute: AppRoute = {
  page: "calendar",
  visibleYear: calendarYear,
  visibleMonth: calendarMonth,
  selectedDay: 17,
  submissionDate: todaySubmissionDate,
  calendarView: "grid"
};

export function formatAppRouteHash(route: AppRoute): string {
  if (route.page === "calendar") {
    return `#/calendar/${route.visibleYear}/${route.visibleMonth}/${route.calendarView}`;
  }

  if (route.page === "submissions") {
    return `#/submissions/${route.visibleYear}/${route.visibleMonth}`;
  }

  if (route.page === "detail") {
    return `#/detail/${route.submissionDate}`;
  }

  return `#/${route.page}/${route.submissionDate}`;
}

export function parseAppRouteHash(hash: string): AppRoute {
  const [page, first, second, third] = hash.replace(/^#\/?/, "").split("/");

  if (page === "calendar" || page === "") {
    if (page === "") return defaultAppRoute;

    const visibleMonth = parseVisibleMonth(first, second);
    if (!visibleMonth) return defaultAppRoute;

    return {
      ...defaultAppRoute,
      page,
      visibleYear: visibleMonth.year,
      visibleMonth: visibleMonth.month,
      selectedDay: 1,
      submissionDate: formatSubmissionDate(visibleMonth.year, visibleMonth.month, 1),
      calendarView: third === "list" ? "list" : "grid"
    };
  }

  if (page === "submissions") {
    const visibleMonth = parseVisibleMonth(first, second);
    if (!visibleMonth) return defaultAppRoute;

    return {
      ...defaultAppRoute,
      page,
      visibleYear: visibleMonth.year,
      visibleMonth: visibleMonth.month,
      selectedDay: 1,
      submissionDate: formatSubmissionDate(visibleMonth.year, visibleMonth.month, 1)
    };
  }

  if (page === "detail") {
    if (!isSubmissionDate(first)) {
      return defaultAppRoute;
    }

    return routeFromSubmissionDate(page, first, defaultAppRoute);
  }

  if (page === "upload" || page === "review") {
    if (!isSubmissionDate(first)) {
      return defaultAppRoute;
    }

    return routeFromSubmissionDate(page, first, defaultAppRoute);
  }

  return defaultAppRoute;
}

export function routeFromSubmissionDate(page: Extract<Page, "detail" | "upload" | "review">, submissionDate: string, fallbackRoute: AppRoute): AppRoute {
  if (!isSubmissionDate(submissionDate)) {
    return fallbackRoute;
  }

  const [year, month] = submissionDate.split("-").map(Number);

  return {
    ...fallbackRoute,
    page,
    visibleYear: year,
    visibleMonth: month,
    selectedDay: submissionDayFromDate(submissionDate, year, month, fallbackRoute.selectedDay),
    submissionDate
  };
}

export function routeForVisibleMonth(route: AppRoute, visibleYear: number, visibleMonth: number): AppRoute {
  if (!isValidMonth(visibleYear, visibleMonth)) {
    return route;
  }

  const selectedDay = Math.min(route.selectedDay, daysInMonth(visibleYear, visibleMonth));

  return {
    ...route,
    visibleYear,
    visibleMonth,
    selectedDay,
    submissionDate: formatSubmissionDate(visibleYear, visibleMonth, selectedDay)
  };
}

function parseVisibleMonth(yearValue: string | undefined, monthValue: string | undefined): { year: number; month: number } | null {
  if (!yearValue || !monthValue || !/^\d{4}$/.test(yearValue) || !/^\d{1,2}$/.test(monthValue)) {
    return null;
  }

  const year = Number(yearValue);
  const month = Number(monthValue);

  return isValidMonth(year, month) ? { year, month } : null;
}

function isValidMonth(year: number, month: number): boolean {
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isSubmissionDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
