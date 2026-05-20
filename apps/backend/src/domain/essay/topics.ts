export interface EssayTopic {
  id: string;
  title: string;
  prompt: string;
}

export const MVP_ESSAY_TOPICS = [
  {
    id: "free-assignment",
    title: "自由課題",
    prompt: "書きたいことを自由に書きましょう。"
  }
] as const satisfies readonly EssayTopic[];

export function pickRandomEssayTopic(random: () => number = Math.random): EssayTopic {
  const index = Math.floor(random() * MVP_ESSAY_TOPICS.length);
  return MVP_ESSAY_TOPICS[Math.min(index, MVP_ESSAY_TOPICS.length - 1)];
}

export function findEssayTopic(topicId: string): EssayTopic | undefined {
  return MVP_ESSAY_TOPICS.find((topic) => topic.id === topicId);
}
