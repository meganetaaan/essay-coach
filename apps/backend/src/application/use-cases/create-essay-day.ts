import type { EssayRepository } from "../ports/essay-repository";
import type { EssayDay } from "../../domain/essay/essay-day";
import { findEssayTopic, pickRandomEssayTopic } from "../../domain/essay/topics";
import { createId } from "../../shared/ids";

export interface CreateEssayDayInput {
  childId: string;
  childGrade: number;
  date: string;
  topicId?: string;
}

export async function createEssayDay(
  input: CreateEssayDayInput,
  deps: { essays: EssayRepository; random?: () => number }
): Promise<EssayDay> {
  const topic = input.topicId ? findEssayTopic(input.topicId) : pickRandomEssayTopic(deps.random);
  if (!topic) throw new Error(`Unknown essay topic: ${input.topicId}`);

  const existing = await deps.essays.findEssayDayByChildAndDate(input.childId, input.date);
  if (existing) {
    if (input.topicId && existing.topic.id !== topic.id) {
      const updated = { ...existing, childGrade: input.childGrade, topic };
      await deps.essays.saveEssayDay(updated);
      return updated;
    }

    return existing;
  }

  const essayDay: EssayDay = {
    id: createId("essay_day"),
    childId: input.childId,
    childGrade: input.childGrade,
    date: input.date,
    topic,
    createdAt: new Date()
  };
  await deps.essays.saveEssayDay(essayDay);
  return essayDay;
}
