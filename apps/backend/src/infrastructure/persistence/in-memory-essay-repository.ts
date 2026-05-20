import type { EssayRepository } from "../../application/ports/essay-repository";
import type { Child } from "../../domain/child/child";
import type { EssayDay } from "../../domain/essay/essay-day";
import type { EssaySubmission } from "../../domain/essay/essay-submission";

export class InMemoryEssayRepository implements EssayRepository {
  private readonly children = new Map<string, Child & { guardianId: string }>();
  private readonly essayDays = new Map<string, EssayDay>();
  private readonly submissions = new Map<string, EssaySubmission>();

  async ensureDefaultChildForGuardian(input: { guardianId: string; displayName?: string; grade?: number }): Promise<Child> {
    const existing = [...this.children.values()].find((child) => child.guardianId === input.guardianId);
    if (existing) return { id: existing.id, displayName: existing.displayName, grade: existing.grade };

    const child: Child & { guardianId: string } = {
      id: defaultChildIdForGuardian(input.guardianId),
      guardianId: input.guardianId,
      displayName: input.displayName ?? "デフォルト児童",
      grade: input.grade ?? 6
    };
    this.children.set(child.id, child);
    return { id: child.id, displayName: child.displayName, grade: child.grade };
  }

  async findGuardianIdByChildId(childId: string): Promise<string | undefined> {
    return this.children.get(childId)?.guardianId;
  }

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

function defaultChildIdForGuardian(guardianId: string): string {
  return `child_${guardianId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}
