import type { EssayReviewRequest } from "../../../application/ports/essay-reviewer";
import { getRubric } from "../../../domain/review/review";

export class HermesReviewPromptBuilder {
  build(request: EssayReviewRequest): string {
    const rubric = getRubric(request.strictness);
    return [
      "You are reviewing a handwritten Japanese elementary school essay image.",
      `Image path or URL: ${request.imageUrlOrPath}`,
      "",
      "Tasks:",
      "1. OCR the handwritten essay image into Japanese text.",
      "2. Review the essay for a child and parent.",
      "3. Topic adherence is optional. The child did not have to write exactly to the topic, but you must evaluate and comment on how the essay relates to the topic.",
      "",
      `Child grade: ${request.childGrade}`,
      `Essay date: ${request.essayDate}`,
      `Topic title: ${request.topic.title}`,
      `Topic prompt: ${request.topic.prompt}`,
      `Strictness: ${request.strictness.toUpperCase()}`,
      "Topic adherence required: false",
      "",
      "Use this rubric. Each dimension score must be an integer from 0 to its max, and totalScore must equal the sum.",
      JSON.stringify(rubric, null, 2),
      "",
      "Return JSON only, with this shape:",
      JSON.stringify(
        {
          ocrText: "string",
          totalScore: 0,
          scores: rubric,
          topicComment: "string",
          strengths: ["string"],
          improvementPoints: ["string"],
          rewriteAdvice: ["string"],
          childFriendlyComment: "string",
          parentSummary: "string"
        },
        null,
        2
      )
    ].join("\n");
  }
}
