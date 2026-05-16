import type { EssayRepository } from "../../application/ports/essay-repository";
import type { EssayDay } from "../../domain/essay/essay-day";
import type { EssaySubmission } from "../../domain/essay/essay-submission";

export class InMemoryEssayRepository implements EssayRepository {
  private readonly essayDays = new Map<string, EssayDay>();
  private readonly submissions = new Map<string, EssaySubmission>();

  async findEssayDayByChildAndDate(childId: string, date: string): Promise<EssayDay | undefined> {
    return [...this.essayDays.values()].find((day) => day.childId === childId && day.date === date);
  }

  async findEssayDayById(id: string): Promise<EssayDay | undefined> {
    return this.essayDays.get(id);
  }

  async saveEssayDay(day: EssayDay): Promise<void> {
    this.essayDays.set(day.id, day);
  }

  async listEssayDaysForMonth(input: { childId: string; year: number; month: number }): Promise<EssayDay[]> {
    const prefix = `${input.year}-${String(input.month).padStart(2, "0")}`;
    return [...this.essayDays.values()]
      .filter((day) => day.childId === input.childId && day.date.startsWith(prefix))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async listSubmissionsByEssayDay(essayDayId: string): Promise<EssaySubmission[]> {
    return [...this.submissions.values()]
      .filter((submission) => submission.essayDayId === essayDayId)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
  }

  async findSubmissionById(id: string): Promise<EssaySubmission | undefined> {
    return this.submissions.get(id);
  }

  async saveSubmission(submission: EssaySubmission): Promise<void> {
    this.submissions.set(submission.id, submission);
  }

  async updateSubmission(submission: EssaySubmission): Promise<void> {
    if (!this.submissions.has(submission.id)) throw new Error(`Submission not found: ${submission.id}`);
    this.submissions.set(submission.id, submission);
  }
}
