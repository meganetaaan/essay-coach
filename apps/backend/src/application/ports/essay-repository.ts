import type { EssayDay } from "../../domain/essay/essay-day";
import type { EssaySubmission } from "../../domain/essay/essay-submission";
import type { Child } from "../../domain/child/child";

export interface EssayRepository {
  ensureDefaultChildForGuardian(input: { guardianId: string; displayName?: string; grade?: number }): Promise<Child>;
  findGuardianIdByChildId(childId: string): Promise<string | undefined>;
  findEssayDayByChildAndDate(childId: string, date: string): Promise<EssayDay | undefined>;
  findEssayDayById(id: string): Promise<EssayDay | undefined>;
  saveEssayDay(day: EssayDay): Promise<void>;
  listEssayDaysForMonth(input: { childId: string; year: number; month: number }): Promise<EssayDay[]>;
  listSubmissionsByEssayDay(essayDayId: string): Promise<EssaySubmission[]>;
  findSubmissionById(id: string): Promise<EssaySubmission | undefined>;
  saveSubmission(submission: EssaySubmission): Promise<void>;
  updateSubmission(submission: EssaySubmission): Promise<void>;
}
