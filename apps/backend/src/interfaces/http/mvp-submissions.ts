import type { EssayDay } from "../../domain/essay/essay-day";
import type { EssaySubmission, ReviewJobStatus } from "../../domain/essay/essay-submission";
import type { Review, ReviewStrictness } from "../../domain/review/review";
import type { AppDependencies } from "../../app/create-app";
import type { HttpResponse } from "./http-contracts";
import { DEMO_CHILD_GRADE, DEMO_CHILD_ID } from "../../infrastructure/persistence/sqlite-database";

export interface CreateMvpSubmissionRequest {
  date?: unknown;
  strictness?: unknown;
  contentType?: unknown;
  imageDataUrl?: unknown;
  sampleReviewId?: unknown;
}

export interface MvpSubmissionResponse {
  essayDay: {
    id: string;
    childId: string;
    childGrade: number;
    date: string;
    topic: EssayDay["topic"];
    createdAt: string;
  };
  submission: {
    id: string;
    essayDayId: string;
    attemptNumber: number;
    strictness: ReviewStrictness;
    imageObjectKey: string;
    ocrText?: string;
    reviewStatus: EssaySubmission["reviewStatus"];
    submittedAt: string;
  };
  review?: {
    id: string;
    submissionId: string;
    strictness: ReviewStrictness;
    ocrText: string;
    totalScore: number;
    scores: Review["scores"];
    topicComment: string;
    strengths: string[];
    improvementPoints: string[];
    rewriteAdvice: string[];
    childFriendlyComment: string;
    parentSummary: string;
    rawOutput: unknown;
    createdAt: string;
  };
  submissionHistory: Array<{
    submission: MvpSubmissionResponse["submission"];
    score?: number;
  }>;
  imagePreviewUrl?: string;
  processStatus: ReviewJobStatus;
}

export interface ListMvpMonthSubmissionsQuery {
  year?: unknown;
  month?: unknown;
}

export interface MvpMonthSubmissionsResponse {
  days: Array<{
    essayDay: MvpSubmissionResponse["essayDay"];
    latestSubmission?: MvpSubmissionResponse["submission"];
    review?: MvpSubmissionResponse["review"];
    submissionHistory: MvpSubmissionResponse["submissionHistory"];
    processStatus: ReviewJobStatus;
  }>;
}

export interface MvpSubmissionHandlerRoot {
  deps: AppDependencies;
  app: {
    createEssayDay(input: { childId: string; childGrade: number; date: string; topicId?: string }): Promise<EssayDay>;
    uploadEssaySubmission(input: {
      essayDayId: string;
      strictness: ReviewStrictness;
      contentType: string;
      body: Buffer;
    }): Promise<EssaySubmission>;
  };
  processReviewJob(): Promise<{ processed: boolean; submissionId?: string }>;
}

const supportedImageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);
const demoChild = { id: DEMO_CHILD_ID, grade: DEMO_CHILD_GRADE };

export async function handleCreateMvpSubmission(
  request: CreateMvpSubmissionRequest,
  root: MvpSubmissionHandlerRoot
): Promise<HttpResponse<MvpSubmissionResponse | { error: string }>> {
  const validation = validateRequest(request);
  if ("error" in validation) {
    return { status: 400, body: { error: validation.error } };
  }

  const essayDay = await root.app.createEssayDay({
    childId: demoChild.id,
    childGrade: demoChild.grade,
    date: validation.date,
    topicId: "kindness"
  });
  const submission = await root.app.uploadEssaySubmission({
    essayDayId: essayDay.id,
    strictness: validation.strictness,
    contentType: validation.contentType,
    body: validation.body
  });

  return {
    status: 201,
    body: {
      essayDay: serializeEssayDay(essayDay),
      submission: serializeSubmission(submission),
      submissionHistory: [{ submission: serializeSubmission(submission) }],
      imagePreviewUrl: validation.imageDataUrl,
      processStatus: submission.reviewStatus
    }
  };
}

export async function handleGetMvpSubmissionStatus(
  submissionId: string,
  root: MvpSubmissionHandlerRoot
): Promise<HttpResponse<MvpSubmissionResponse | { error: string }>> {
  const submission = await root.deps.essays.findSubmissionById(submissionId);
  if (!submission) return { status: 404, body: { error: "submission was not found" } };

  const essayDay = await root.deps.essays.findEssayDayById(submission.essayDayId);
  if (!essayDay) return { status: 404, body: { error: "essay day was not found" } };

  const review = await root.deps.reviews.findBySubmissionId(submission.id);
  const sameDaySubmissions = await root.deps.essays.listSubmissionsByEssayDay(essayDay.id);
  const submissionHistory = await buildSubmissionHistory(sameDaySubmissions, root);

  return {
    status: 200,
    body: {
      essayDay: serializeEssayDay(essayDay),
      submission: serializeSubmission(submission),
      review: review ? serializeReview(review) : undefined,
      submissionHistory,
      processStatus: submission.reviewStatus
    }
  };
}

export async function handleListMvpMonthSubmissions(
  query: ListMvpMonthSubmissionsQuery,
  root: MvpSubmissionHandlerRoot
): Promise<HttpResponse<MvpMonthSubmissionsResponse | { error: string }>> {
  const validation = validateMonthQuery(query);
  if ("error" in validation) {
    return { status: 400, body: { error: validation.error } };
  }

  const essayDays = await root.deps.essays.listEssayDaysForMonth({
    childId: demoChild.id,
    year: validation.year,
    month: validation.month
  });

  const days = await Promise.all(
    essayDays.map(async (essayDay) => {
      const submissions = await root.deps.essays.listSubmissionsByEssayDay(essayDay.id);
      const latestSubmission = submissions.at(-1);
      const review = latestSubmission ? await root.deps.reviews.findBySubmissionId(latestSubmission.id) : undefined;
      const submissionHistory = await buildSubmissionHistory(submissions, root);

      return {
        essayDay: serializeEssayDay(essayDay),
        latestSubmission: latestSubmission ? serializeSubmission(latestSubmission) : undefined,
        review: review ? serializeReview(review) : undefined,
        submissionHistory,
        processStatus: latestSubmission?.reviewStatus ?? "queued"
      };
    })
  );

  return {
    status: 200,
    body: {
      days: days.filter((day) => day.latestSubmission)
    }
  };
}

function validateRequest(
  request: CreateMvpSubmissionRequest
):
  | { error: string }
  | {
      date: string;
      strictness: ReviewStrictness;
      contentType: string;
      imageDataUrl: string;
      body: Buffer;
    } {
  if (typeof request.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
    return { error: "date must be YYYY-MM-DD" };
  }

  if (request.strictness !== "easy" && request.strictness !== "hard") {
    return { error: "strictness must be easy or hard" };
  }

  if (typeof request.contentType !== "string" || !supportedImageTypes.has(request.contentType)) {
    return { error: "contentType must be a supported image type" };
  }

  if (typeof request.imageDataUrl !== "string" || request.imageDataUrl.length === 0) {
    return { error: "imageDataUrl is required" };
  }

  const prefix = `data:${request.contentType};base64,`;
  if (!request.imageDataUrl.startsWith(prefix)) {
    return { error: "imageDataUrl must match contentType and use base64" };
  }

  const encoded = request.imageDataUrl.slice(prefix.length);
  const body = Buffer.from(encoded, "base64");
  if (body.length === 0 || body.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) {
    return { error: "imageDataUrl must contain valid base64 image data" };
  }

  return {
    date: request.date,
    strictness: request.strictness,
    contentType: request.contentType,
    imageDataUrl: request.imageDataUrl,
    body
  };
}

function validateMonthQuery(query: ListMvpMonthSubmissionsQuery): { error: string } | { year: number; month: number } {
  const year = parseNumericQueryValue(query.year);
  const month = parseNumericQueryValue(query.month);

  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "year must be a valid calendar year" };
  }

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "month must be between 1 and 12" };
  }

  return { year, month };
}

function parseNumericQueryValue(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return Number.NaN;
}

function serializeEssayDay(essayDay: EssayDay): MvpSubmissionResponse["essayDay"] {
  return {
    id: essayDay.id,
    childId: essayDay.childId,
    childGrade: essayDay.childGrade,
    date: essayDay.date,
    topic: essayDay.topic,
    createdAt: essayDay.createdAt.toISOString()
  };
}

function serializeSubmission(submission: EssaySubmission): MvpSubmissionResponse["submission"] {
  return {
    ...submission,
    submittedAt: submission.submittedAt.toISOString()
  };
}

function serializeReview(review: Review): MvpSubmissionResponse["review"] {
  return {
    ...review,
    createdAt: review.createdAt.toISOString()
  };
}

async function buildSubmissionHistory(
  submissions: EssaySubmission[],
  root: MvpSubmissionHandlerRoot
): Promise<MvpSubmissionResponse["submissionHistory"]> {
  return Promise.all(
    submissions.map(async (submission) => {
      const review = await root.deps.reviews.findBySubmissionId(submission.id);
      return {
        submission: serializeSubmission(submission),
        score: review?.totalScore
      };
    })
  );
}
