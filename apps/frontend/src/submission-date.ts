export function formatSubmissionDate(year: number, month: number, day: number) {
  return [year, month, day].map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0"))).join("-");
}

export function submissionDayFromDate(dateValue: string, visibleYear: number, visibleMonth: number, fallbackDay = 1) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);

  if (!match) {
    return fallbackDay;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year !== visibleYear || month !== visibleMonth) {
    return fallbackDay;
  }

  return day;
}
