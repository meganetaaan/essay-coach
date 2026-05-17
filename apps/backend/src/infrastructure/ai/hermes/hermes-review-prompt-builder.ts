import type { EssayReviewRequest } from "../../../application/ports/essay-reviewer";
import { getRubric, getRubricGuidance } from "../../../domain/review/review";

export class HermesReviewPromptBuilder {
  build(request: EssayReviewRequest): string {
    const rubric = getRubric(request.strictness, request.childGrade);
    const guidance = getRubricGuidance({ strictness: request.strictness, childGrade: request.childGrade });
    return [
      "The handwritten Japanese essay image is attached.",
      "OCR the attached image and review the essay for an elementary school child and parent.",
      "",
      "Tasks:",
      "1. Read the handwriting and set ocrText to the Japanese text you can identify.",
      "2. Score the essay with the 100-point rubric below.",
      "3. Topic adherence is optional. The child did not have to write exactly to the topic, but you must evaluate and comment on how the essay relates to the topic.",
      "4. Write comments in clear, natural Japanese. Avoid long vague AI-like phrasing.",
      "",
      `Child grade: 小学${request.childGrade}年生`,
      `Essay date: ${request.essayDate}`,
      `Topic title: ${request.topic.title}`,
      `Topic prompt: ${request.topic.prompt}`,
      `Strictness: ${request.strictness.toUpperCase()}`,
      "Topic adherence required: false",
      "",
      "Rubric guidance:",
      `- Policy basis: ${guidance.policyBasis}`,
      `- Grade focus: ${guidance.gradeFocus}`,
      `- Vocabulary level: ${guidance.vocabularyLevel}`,
      "- Dimension guidance:",
      ...Object.entries(guidance.dimensionGuidance).map(([key, value]) => `  - ${key}: ${value}`),
      ...(guidance.extraEntranceExamFocus.length > 0
        ? ["- Extra hard-mode focus:", ...guidance.extraEntranceExamFocus.map((focus) => `  - ${focus}`)]
        : []),
      "",
      "Use this grade-specific 100-point rubric. Each dimension score must be an integer from 0 to its max, totalScore must be 0-100, and totalScore must equal the sum.",
      JSON.stringify(rubric, null, 2),
      "",
      "Return JSON only, with English keys and Japanese comment values. childFriendlyComment should be concrete and encouraging.",
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
