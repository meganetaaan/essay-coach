import type { ReviewStrictness } from "./reviews";

export interface EssayTopicDto {
  id: string;
  title: string;
  prompt: string;
}

export interface EssayDayDto {
  id: string;
  childId: string;
  date: string;
  topic: EssayTopicDto;
  createdAt: string;
}

export interface CreateEssayDayRequestDto {
  childId: string;
  childGrade: number;
  date: string;
  topicId?: string;
}

export interface UploadEssaySubmissionRequestDto {
  essayDayId: string;
  childGrade: number;
  strictness: ReviewStrictness;
}
