import type { EssayRepository } from "../ports/essay-repository";

export async function getMonthlyCalendar(
  input: { childId: string; year: number; month: number },
  deps: { essays: EssayRepository }
) {
  const essayDays = await deps.essays.listEssayDaysForMonth(input);
  const daysInMonth = new Date(input.year, input.month, 0).getDate();
  const days = [];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${input.year}-${String(input.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const essayDay = essayDays.find((candidate) => candidate.date === date);
    const submissions = essayDay ? await deps.essays.listSubmissionsByEssayDay(essayDay.id) : [];
    const latest = submissions.at(-1);
    days.push({
      date,
      essayDay: essayDay && {
        ...essayDay,
        createdAt: essayDay.createdAt.toISOString()
      },
      latestAttemptNumber: latest?.attemptNumber,
      reviewStatus: latest?.reviewStatus
    });
  }

  return { childId: input.childId, year: input.year, month: input.month, days };
}
