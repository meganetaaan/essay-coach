import type { EssayDayDto, EssaySubmissionDto, ReviewDto, ReviewJobStatusDto, ReviewStrictness } from "@essay-coach/contracts";

export interface MvpSubmissionHistoryItem {
  submission: EssaySubmissionDto;
  score?: number;
}

export interface MvpSubmissionResult {
  essayDay: EssayDayDto;
  submission: EssaySubmissionDto;
  review?: ReviewDto;
  submissionHistory: MvpSubmissionHistoryItem[];
  imagePreviewUrl?: string;
  processStatus: ReviewJobStatusDto;
}

export interface MvpMonthSubmissionDay {
  essayDay: EssayDayDto;
  latestSubmission?: EssaySubmissionDto;
  review?: ReviewDto;
  submissionHistory: MvpSubmissionHistoryItem[];
  processStatus: ReviewJobStatusDto;
}

export interface MvpMonthSubmissionsResult {
  days: MvpMonthSubmissionDay[];
}

export interface MvpSubmissionRequestInput {
  date: string;
  strictness: ReviewStrictness;
  fileName: string;
  contentType: string;
  imageDataUrl: string;
  sampleReviewId?: string;
}

const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

export function isSupportedImageContentType(contentType: string): boolean {
  return supportedImageTypes.has(contentType);
}

export function buildMvpSubmissionRequest(input: MvpSubmissionRequestInput) {
  if (!isSupportedImageContentType(input.contentType)) {
    throw new Error("PNG、JPEG、WebP、GIF、SVG の画像を選んでください。");
  }

  return {
    date: input.date,
    strictness: input.strictness,
    contentType: input.contentType,
    imageDataUrl: input.imageDataUrl,
    sampleReviewId: input.sampleReviewId,
    fileName: input.fileName
  };
}

export function getMvpReviewStatusMessage(status: ReviewJobStatusDto): string {
  switch (status) {
    case "queued":
      return "提出を受け付けました";
    case "processing":
      return "レビューを作成中...";
    case "completed":
      return "レビューが完成しました";
    case "failed":
      return "レビュー作成に失敗しました";
  }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("画像の読み込みに失敗しました。"));
    };
    reader.onerror = () => reject(new Error("画像の読み込みに失敗しました。"));
    reader.readAsDataURL(file);
  });
}

export async function submitMvpSubmission(input: MvpSubmissionRequestInput): Promise<MvpSubmissionResult> {
  const response = await fetch("/api/mvp/submissions", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(buildMvpSubmissionRequest(input))
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "レビュー作成に失敗しました。");
  }

  return body as MvpSubmissionResult;
}

export async function getMvpSubmissionStatus(submissionId: string): Promise<MvpSubmissionResult> {
  const response = await fetch(`/api/mvp/submissions/${encodeURIComponent(submissionId)}`);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "レビュー状態の取得に失敗しました。");
  }

  return body as MvpSubmissionResult;
}

export async function getMvpMonthSubmissions(input: { year: number; month: number }): Promise<MvpMonthSubmissionsResult> {
  const params = new URLSearchParams({
    year: String(input.year),
    month: String(input.month)
  });
  const response = await fetch(`/api/mvp/submissions?${params.toString()}`);
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "提出済み一覧の取得に失敗しました。");
  }

  return body as MvpMonthSubmissionsResult;
}

export function selectMvpSubmissionResultForDay(
  days: MvpMonthSubmissionDay[],
  selectedDay: number
): MvpSubmissionResult | undefined {
  const day = days.find((candidate) => Number(candidate.essayDay.date.slice(-2)) === selectedDay);
  if (!day?.latestSubmission) return undefined;

  return {
    essayDay: day.essayDay,
    submission: day.latestSubmission,
    review: day.review,
    submissionHistory: day.submissionHistory,
    processStatus: day.processStatus
  };
}
