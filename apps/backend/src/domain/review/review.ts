export type ReviewStrictness = "easy" | "hard";

export interface ReviewScoreBreakdown {
  topicRelation: number;
  taskUnderstanding: number;
  structure: number;
  specificity: number;
  expression: number;
  grammarAndNotation: number;
  readerAwareness: number;
}

export type ReviewRubric = ReviewScoreBreakdown;

export interface ReviewRubricGuidance {
  strictness: ReviewStrictness;
  childGrade: number;
  policyBasis: string;
  gradeFocus: string;
  vocabularyLevel: string;
  dimensionGuidance: Record<keyof ReviewScoreBreakdown, string>;
  extraEntranceExamFocus: string[];
}

export const EASY_REVIEW_RUBRIC: ReviewRubric = {
  topicRelation: 10,
  taskUnderstanding: 20,
  structure: 20,
  specificity: 20,
  expression: 15,
  grammarAndNotation: 10,
  readerAwareness: 5
};

export const HARD_REVIEW_RUBRIC: ReviewRubric = {
  topicRelation: 20,
  taskUnderstanding: 15,
  structure: 20,
  specificity: 15,
  expression: 15,
  grammarAndNotation: 10,
  readerAwareness: 5
};

const GRADE_BAND_EASY_RUBRICS: Record<"lower" | "middle" | "upper", ReviewRubric> = {
  lower: {
    topicRelation: 10,
    taskUnderstanding: 15,
    structure: 10,
    specificity: 20,
    expression: 15,
    grammarAndNotation: 15,
    readerAwareness: 15
  },
  middle: {
    topicRelation: 10,
    taskUnderstanding: 20,
    structure: 15,
    specificity: 20,
    expression: 15,
    grammarAndNotation: 10,
    readerAwareness: 10
  },
  upper: {
    topicRelation: 10,
    taskUnderstanding: 20,
    structure: 20,
    specificity: 20,
    expression: 15,
    grammarAndNotation: 10,
    readerAwareness: 5
  }
};

const GRADE_BAND_HARD_RUBRICS: Record<"lower" | "middle" | "upper", ReviewRubric> = {
  lower: {
    topicRelation: 15,
    taskUnderstanding: 15,
    structure: 15,
    specificity: 20,
    expression: 15,
    grammarAndNotation: 10,
    readerAwareness: 10
  },
  middle: {
    topicRelation: 20,
    taskUnderstanding: 15,
    structure: 20,
    specificity: 15,
    expression: 10,
    grammarAndNotation: 10,
    readerAwareness: 10
  },
  upper: {
    topicRelation: 20,
    taskUnderstanding: 15,
    structure: 20,
    specificity: 15,
    expression: 15,
    grammarAndNotation: 10,
    readerAwareness: 5
  }
};

const GRADE_FOCUS: Record<"lower" | "middle" | "upper", string> = {
  lower: "小学1・2年生: 経験したことを順序に沿って書き、主語・述語、句読点、助詞を大切にする。",
  middle: "小学3・4年生: 中心を決め、段落を意識して、理由や様子が伝わるように書く。",
  upper: "小学5・6年生: 目的や相手を意識し、事実と考えを分け、構成を整えて自分の考えを明確に書く。"
};

export interface Review {
  id: string;
  submissionId: string;
  strictness: ReviewStrictness;
  ocrText: string;
  totalScore: number;
  scores: ReviewScoreBreakdown;
  topicComment: string;
  strengths: string[];
  improvementPoints: string[];
  rewriteAdvice: string[];
  childFriendlyComment: string;
  parentSummary: string;
  rawOutput: unknown;
  createdAt: Date;
}

export function getRubric(strictness: ReviewStrictness, childGrade = 6): ReviewRubric {
  const band = gradeBand(childGrade);
  return strictness === "easy" ? GRADE_BAND_EASY_RUBRICS[band] : GRADE_BAND_HARD_RUBRICS[band];
}

export function getRubricGuidance(input: { strictness: ReviewStrictness; childGrade: number }): ReviewRubricGuidance {
  const band = gradeBand(input.childGrade);
  const isHard = input.strictness === "hard";

  return {
    strictness: input.strictness,
    childGrade: input.childGrade,
    policyBasis: "東京都の小学校国語の学習指導要領に沿い、発達段階に応じた作文観点で評価する。",
    gradeFocus: `小学${input.childGrade}年生 / ${GRADE_FOCUS[band]}`,
    vocabularyLevel: isHard
      ? "一段高度な語彙で、ただし小学生本人が次に直せる具体性を保つ。"
      : "学年相応のやさしい語彙で、本人が読み返して直せる言葉にする。",
    dimensionGuidance: {
      topicRelation: isHard
        ? "題名・課題文と経験や意見を結び、問いに対する立場が見えるか。"
        : "題名や書きたいことと本文がつながっているか。",
      taskUnderstanding: isHard
        ? "課題の条件を読み取り、経験・理由・考えを過不足なく書けているか。"
        : "何について書く作文かをとらえ、中心がずれていないか。",
      structure: isHard
        ? "導入、具体例、考え、まとめの流れがあり、段落の役割が分かるか。"
        : "はじめ・中・おわり、または順序が読み取りやすいか。",
      specificity: isHard
        ? "場面、行動、会話、気持ち、理由が具体化され、読み手が情景を想像できるか。"
        : "いつ・どこで・だれが・何をしたかが具体的に書けているか。",
      expression: isHard
        ? "同じ語の反復を避け、心情や考えをより的確な語彙で表現できているか。"
        : "気持ちや様子が伝わる言葉を使えているか。",
      grammarAndNotation: "誤字脱字、かなづかい、漢字、句読点、主語述語、文末が読みやすいか。",
      readerAwareness: isHard
        ? "読み手に何を伝えたいかが明確で、結論や学びが残るか。"
        : "読んだ人に伝わるように説明を足せているか。"
    },
    extraEntranceExamFocus: isHard
      ? [
          "都立型中学受験で問われる、課題文・資料・題名への応答を確認する。",
          "自分の体験から一般化した考えへ進められているかを見る。",
          "条件を満たす構成、理由づけ、読み手への説得力を重視する。"
        ]
      : []
  };
}

export function rubricTotal(rubric: ReviewRubric): number {
  return Object.values(rubric).reduce((sum, value) => sum + value, 0);
}

export function scoreTotal(scores: ReviewScoreBreakdown): number {
  return Object.values(scores).reduce((sum, value) => sum + value, 0);
}

export function validateReviewScores(input: {
  strictness: ReviewStrictness;
  childGrade?: number;
  scores: ReviewScoreBreakdown;
  totalScore: number;
}): void {
  const rubric = getRubric(input.strictness, input.childGrade);
  for (const [dimension, score] of Object.entries(input.scores) as Array<[keyof ReviewScoreBreakdown, number]>) {
    if (!Number.isFinite(score) || score < 0 || score > rubric[dimension]) {
      throw new Error(`Invalid score for ${dimension}: ${score} exceeds max ${rubric[dimension]}`);
    }
  }

  const computedTotal = scoreTotal(input.scores);
  if (input.totalScore !== computedTotal) {
    throw new Error(`Invalid total score: expected ${computedTotal}, got ${input.totalScore}`);
  }
}

function gradeBand(childGrade: number): "lower" | "middle" | "upper" {
  if (childGrade <= 2) return "lower";
  if (childGrade <= 4) return "middle";
  return "upper";
}
