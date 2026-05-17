import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMvpSubmissionRequest,
  getMvpMonthSubmissions,
  getMvpReviewStatusMessage,
  isSupportedImageContentType,
  selectMvpSubmissionResultForDay,
  type MvpMonthSubmissionsResult
} from "./mvp-api";

describe("MVP API helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds the submission request payload", () => {
    expect(
      buildMvpSubmissionRequest({
        date: "2026-05-17",
        strictness: "easy",
        fileName: "essay.png",
        contentType: "image/png",
        imageDataUrl: "data:image/png;base64,aW1hZ2U=",
        sampleReviewId: "strong"
      })
    ).toMatchObject({
      date: "2026-05-17",
      strictness: "easy",
      contentType: "image/png",
      imageDataUrl: "data:image/png;base64,aW1hZ2U=",
      sampleReviewId: "strong",
      fileName: "essay.png"
    });
  });

  it("rejects unsupported image types", () => {
    expect(isSupportedImageContentType("application/pdf")).toBe(false);
    expect(() =>
      buildMvpSubmissionRequest({
        date: "2026-05-17",
        strictness: "easy",
        fileName: "essay.pdf",
        contentType: "application/pdf",
        imageDataUrl: "data:application/pdf;base64,aW1hZ2U="
      })
    ).toThrow("PNG");
  });

  it("maps review lifecycle statuses to visible Japanese UI messages", () => {
    expect(getMvpReviewStatusMessage("queued")).toBe("提出を受け付けました");
    expect(getMvpReviewStatusMessage("processing")).toBe("レビューを作成中...");
    expect(getMvpReviewStatusMessage("completed")).toBe("レビューが完成しました");
    expect(getMvpReviewStatusMessage("failed")).toBe("レビュー作成に失敗しました");
  });

  it("fetches month submissions from the MVP month summary endpoint", async () => {
    const result: MvpMonthSubmissionsResult = {
      days: [
        {
          essayDay: {
            id: "day-1",
            childId: "child-1",
            date: "2026-05-01",
            topic: { id: "kindness", title: "やさしさについて", prompt: "prompt" },
            createdAt: "2026-05-01T00:00:00.000Z"
          },
          latestSubmission: {
            id: "submission-1",
            essayDayId: "day-1",
            attemptNumber: 1,
            strictness: "easy",
            imageObjectKey: "child-1/2026-05-01/attempt-1.png",
            reviewStatus: "completed",
            submittedAt: "2026-05-01T00:00:00.000Z"
          },
          submissionHistory: [
            {
              submission: {
                id: "submission-1",
                essayDayId: "day-1",
                attemptNumber: 1,
                strictness: "easy",
                imageObjectKey: "child-1/2026-05-01/attempt-1.png",
                reviewStatus: "completed",
                submittedAt: "2026-05-01T00:00:00.000Z"
              },
              score: 80
            }
          ],
          processStatus: "completed"
        }
      ]
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify(result), { status: 200 }));
    vi.stubGlobal("fetch", fetch);

    await expect(getMvpMonthSubmissions({ year: 2026, month: 5 })).resolves.toEqual(result);

    expect(fetch).toHaveBeenCalledWith("/api/mvp/submissions?year=2026&month=5");
  });

  it("selects the restored submission result for the active calendar day", () => {
    const monthResult: MvpMonthSubmissionsResult = {
      days: [
        makeMonthDay("2026-05-01", "submission-1", 1),
        makeMonthDay("2026-05-02", "submission-2", 2)
      ]
    };

    expect(selectMvpSubmissionResultForDay(monthResult.days, 2)?.submission.id).toBe("submission-2");
    expect(selectMvpSubmissionResultForDay(monthResult.days, 3)).toBeUndefined();
  });
});

function makeMonthDay(date: string, submissionId: string, attemptNumber: number): MvpMonthSubmissionsResult["days"][number] {
  const day = date.slice(-2);
  return {
    essayDay: {
      id: `day-${day}`,
      childId: "child-1",
      date,
      topic: { id: "kindness", title: "やさしさについて", prompt: "prompt" },
      createdAt: `${date}T00:00:00.000Z`
    },
    latestSubmission: {
      id: submissionId,
      essayDayId: `day-${day}`,
      attemptNumber,
      strictness: "easy",
      imageObjectKey: `child-1/${date}/attempt-${attemptNumber}.png`,
      reviewStatus: "completed",
      submittedAt: `${date}T00:00:00.000Z`
    },
    submissionHistory: [
      {
        submission: {
          id: submissionId,
          essayDayId: `day-${day}`,
          attemptNumber,
          strictness: "easy",
          imageObjectKey: `child-1/${date}/attempt-${attemptNumber}.png`,
          reviewStatus: "completed",
          submittedAt: `${date}T00:00:00.000Z`
        },
        score: 80
      }
    ],
    review: {
      id: `review-${submissionId}`,
      submissionId,
      strictness: "easy",
      ocrText: "やさしさについて書きました。",
      totalScore: 80,
      scores: {
        topicRelation: 12,
        taskUnderstanding: 12,
        structure: 12,
        specificity: 12,
        expression: 12,
        grammarAndNotation: 10,
        readerAwareness: 10
      },
      topicComment: "題名に合っています。",
      strengths: ["よいです"],
      improvementPoints: ["もう少し詳しく"],
      rewriteAdvice: ["気持ちを書きましょう"],
      childFriendlyComment: "よく書けました。",
      parentSummary: "レビュー済みです。",
      rawOutput: {},
      createdAt: `${date}T00:00:01.000Z`
    },
    processStatus: "completed"
  };
}
