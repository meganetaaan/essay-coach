export interface EssayTopic {
  id: string;
  title: string;
  prompt: string;
}

export const MVP_ESSAY_TOPICS = [
  {
    id: "kindness",
    title: "やさしさについて",
    prompt: "だれかにやさしくしたこと、またはやさしくされたことについて書きましょう。"
  },
  {
    id: "challenge",
    title: "がんばったこと",
    prompt: "さいきん自分ががんばったことと、そのとき考えたことを書きましょう。"
  },
  {
    id: "school-lunch",
    title: "給食の時間",
    prompt: "給食の時間にあったことや、友だちとの会話から考えたことを書きましょう。"
  },
  {
    id: "future-town",
    title: "未来の町",
    prompt: "自分の町がもっとよくなるために、どんなことができるかを書きましょう。"
  }
] as const satisfies readonly EssayTopic[];

export function pickRandomEssayTopic(random: () => number = Math.random): EssayTopic {
  const index = Math.floor(random() * MVP_ESSAY_TOPICS.length);
  return MVP_ESSAY_TOPICS[Math.min(index, MVP_ESSAY_TOPICS.length - 1)];
}

export function findEssayTopic(topicId: string): EssayTopic | undefined {
  return MVP_ESSAY_TOPICS.find((topic) => topic.id === topicId);
}
