import type { ReviewDto, ReviewScoreBreakdownDto, ReviewStrictness } from "@essay-coach/contracts";

export type SampleReviewId = "strong" | "middle" | "needs-work";

export type SampleReview = {
  id: SampleReviewId;
  label: string;
  shortLabel: string;
  description: string;
  imageLines: string[];
  review: ReviewDto;
};

const createdAt = "2026-05-17T00:00:00.000Z";

export const sampleReviews: SampleReview[] = [
  createSampleReview({
    id: "strong",
    label: "高得点: 場面と気持ちが伝わる作文",
    shortLabel: "高得点",
    description: "できごと、会話、気持ち、次の行動まで書けています。",
    imageLines: [
      "休み時間、となりのクラスの一年生が",
      "水とうを落として泣きそうになっていました。",
      "ぼくは先生を呼ぶ前に、ふたをひろって",
      "「だいじょうぶ」と声をかけました。",
      "その子が小さな声でありがとうと言ったので、",
      "むねの中があたたかくなりました。",
      "やさしさは、すぐに気づいて動くことだと思います。"
    ],
    scores: {
      topicRelation: 10,
      taskUnderstanding: 19,
      structure: 14,
      specificity: 18,
      expression: 13,
      grammarAndNotation: 9,
      readerAwareness: 8
    },
    ocrText:
      "休み時間、となりのクラスの一年生が水とうを落として泣きそうになっていました。ぼくは先生を呼ぶ前に、ふたをひろって「だいじょうぶ」と声をかけました。その子が小さな声でありがとうと言ったので、むねの中があたたかくなりました。やさしさは、すぐに気づいて動くことだと思います。",
    topicComment: "題名の「やさしさ」を、具体的な行動と自分の考えで説明できています。",
    strengths: ["場面がはっきりしていて、読んだ人が様子を思い浮かべられます。", "最後に自分の考えを書けているので、作文のまとまりがあります。"],
    improvementPoints: ["一年生がどんな顔をしていたかを一文足すと、さらに気持ちが伝わります。"],
    rewriteAdvice: ["「泣きそう」の前に、顔や声の様子を短く足して、場面をもっと具体的にしましょう。"],
    childFriendlyComment: "やさしさを行動で見せられています。最後の考えも自分の言葉で書けています。",
    parentSummary: "課題理解、具体性、構成が安定しています。表情や音などの描写を足すと、さらに読み手を引き込めます。"
  }),
  createSampleReview({
    id: "middle",
    label: "中得点: 形はあるが具体性がうすい作文",
    shortLabel: "中得点",
    description: "はじめ・中・おわりはありますが、場面の説明が少なめです。",
    imageLines: [
      "わたしは友だちにやさしくしたことがあります。",
      "友だちがこまっていたので、手つだいました。",
      "友だちはうれしそうでした。",
      "わたしもいい気持ちになりました。",
      "これからもやさしくしたいです。"
    ],
    scores: {
      topicRelation: 7,
      taskUnderstanding: 14,
      structure: 11,
      specificity: 10,
      expression: 10,
      grammarAndNotation: 8,
      readerAwareness: 8
    },
    ocrText:
      "わたしは友だちにやさしくしたことがあります。友だちがこまっていたので、手つだいました。友だちはうれしそうでした。わたしもいい気持ちになりました。これからもやさしくしたいです。",
    topicComment: "題名には合っていますが、何に困っていたのかが分かると説得力が増します。",
    strengths: ["題名からそれずに、最後までやさしさについて書けています。", "気持ちの変化を入れようとしている点はよいです。"],
    improvementPoints: ["「こまっていた」「手つだいました」が広い言葉なので、場面が少し見えにくいです。"],
    rewriteAdvice: ["いつ、どこで、何を手つだったのかを一文ずつ足しましょう。会話を一つ入れると自然です。"],
    childFriendlyComment: "作文の形はできています。次は、何をしたのかをもう少しくわしく書いてみましょう。",
    parentSummary: "構成は保てていますが、具体例が薄いため得点が伸びにくい状態です。5W1Hを一つずつ確認すると改善しやすいです。"
  }),
  createSampleReview({
    id: "needs-work",
    label: "要練習: 短く、題名とのつながりが弱い作文",
    shortLabel: "要練習",
    description: "文字数が少なく、やさしさについての説明がほとんどありません。",
    imageLines: [
      "きょうはサッカーをしました。",
      "たのしかったです。",
      "またやりたいです。"
    ],
    scores: {
      topicRelation: 2,
      taskUnderstanding: 7,
      structure: 5,
      specificity: 4,
      expression: 6,
      grammarAndNotation: 6,
      readerAwareness: 4
    },
    ocrText: "きょうはサッカーをしました。たのしかったです。またやりたいです。",
    topicComment: "サッカーの話は書けていますが、題名の「やさしさ」とのつながりがまだ見えません。",
    strengths: ["短い文で、できごとは読み取れます。", "楽しかった気持ちは伝わります。"],
    improvementPoints: ["やさしくしたこと、またはやさしくされたことが書かれていません。", "できごとの説明が短く、読み手が場面を想像しにくいです。"],
    rewriteAdvice: ["サッカー中に友だちへパスをゆずった、転んだ子に声をかけた、など題名につながる場面を選び直しましょう。"],
    childFriendlyComment: "楽しかったことは書けました。次は、やさしさが見える場面を一つ選んで書きましょう。",
    parentSummary: "題意との結びつきと文字量が主な課題です。まずは題名に合う経験を口頭で一つ選ばせてから書くと進めやすいです。"
  })
];

export function getSampleReview(id: string): SampleReview {
  return sampleReviews.find((sample) => sample.id === id) ?? sampleReviews[0];
}

export function scoreTotalFromBreakdown(scores: ReviewScoreBreakdownDto): number {
  return Object.values(scores).reduce((total, score) => total + score, 0);
}

function createSampleReview(input: {
  id: SampleReviewId;
  label: string;
  shortLabel: string;
  description: string;
  imageLines: string[];
  scores: ReviewScoreBreakdownDto;
  ocrText: string;
  topicComment: string;
  strengths: string[];
  improvementPoints: string[];
  rewriteAdvice: string[];
  childFriendlyComment: string;
  parentSummary: string;
  strictness?: ReviewStrictness;
}): SampleReview {
  const review: ReviewDto = {
    id: `review-${input.id}`,
    submissionId: `submission-${input.id}`,
    strictness: input.strictness ?? "easy",
    ocrText: input.ocrText,
    totalScore: scoreTotalFromBreakdown(input.scores),
    scores: input.scores,
    topicComment: input.topicComment,
    strengths: input.strengths,
    improvementPoints: input.improvementPoints,
    rewriteAdvice: input.rewriteAdvice,
    childFriendlyComment: input.childFriendlyComment,
    parentSummary: input.parentSummary,
    rawOutput: {},
    createdAt
  };

  return {
    id: input.id,
    label: input.label,
    shortLabel: input.shortLabel,
    description: input.description,
    imageLines: input.imageLines,
    review
  };
}
