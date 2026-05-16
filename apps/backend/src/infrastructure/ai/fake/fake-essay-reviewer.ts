import type { EssayReviewer, EssayReviewRequest, EssayReviewResult } from "../../../application/ports/essay-reviewer";
import { getRubric } from "../../../domain/review/review";

export class FakeEssayReviewer implements EssayReviewer {
  async reviewEssayImage(request: EssayReviewRequest): Promise<EssayReviewResult> {
    const rubric = getRubric(request.strictness);
    const scores = {
      topicRelation: Math.min(rubric.topicRelation, request.strictness === "easy" ? 8 : 16),
      taskUnderstanding: Math.min(rubric.taskUnderstanding, request.strictness === "easy" ? 17 : 12),
      structure: Math.min(rubric.structure, request.strictness === "easy" ? 12 : 16),
      specificity: Math.min(rubric.specificity, request.strictness === "easy" ? 16 : 12),
      expression: Math.min(rubric.expression, request.strictness === "easy" ? 12 : 8),
      grammarAndNotation: 8,
      readerAwareness: 8
    };
    const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);

    return {
      ocrText: `今日は「${request.topic.title}」について書きました。`,
      totalScore,
      scores,
      topicComment: "題名と作文のつながりが見えます。題名どおりでなくても、自分の経験と結びつけられています。",
      strengths: ["できごとの順番がわかります。", "自分の気持ちが書けています。"],
      improvementPoints: ["理由をもう一文足すと、考えが伝わりやすくなります。"],
      rewriteAdvice: ["いちばん伝えたい気持ちの前に、具体的な会話や行動を一つ足しましょう."],
      childFriendlyComment: "よく書けています。つぎは、どうしてそう思ったのかも書いてみましょう。",
      parentSummary: "MVP用の固定レビューです。OCRと採点保存の動作確認に使います。",
      rawOutput: { reviewer: "fake", imageObjectKey: request.imageObjectKey }
    };
  }
}
