import type { EssayTopic } from "./topics";

export interface EssayDay {
  id: string;
  childId: string;
  childGrade: number;
  date: string;
  topic: EssayTopic;
  createdAt: Date;
}
