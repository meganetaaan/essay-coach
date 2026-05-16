import type { EssayDayDto } from "./essay-days";

export interface CalendarDayDto {
  date: string;
  essayDay?: EssayDayDto;
  latestAttemptNumber?: number;
  reviewStatus?: "queued" | "processing" | "completed" | "failed";
}

export interface MonthlyCalendarDto {
  childId: string;
  year: number;
  month: number;
  days: CalendarDayDto[];
}
