import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, ChevronLeft, FileImage, Gauge, Upload } from "lucide-react";
import type { ReviewJobStatusDto, ReviewScoreBreakdownDto, ReviewStrictness } from "@essay-coach/contracts";
import {
  type AppRoute,
  calendarMonth,
  calendarYear,
  defaultAppRoute,
  formatAppRouteHash,
  parseAppRouteHash,
  routeFromSubmissionDate,
  todaySubmissionDate
} from "./app-route";
import { calculateCharacterTarget } from "./character-target";
import { formatSubmissionDate, submissionDayFromDate } from "./submission-date";
import {
  getMvpMonthSubmissions,
  getMvpReviewStatusMessage,
  getMvpSubmissionStatus,
  readFileAsDataUrl,
  selectMvpSubmissionResultForDay,
  submitMvpSubmission,
  type MvpMonthSubmissionDay,
  type MvpSubmissionHistoryItem,
  type MvpSubmissionResult
} from "./mvp-api";
import "./styles.css";

const topic = {
  id: "kindness",
  title: "やさしさについて",
  prompt: "だれかにやさしくしたこと、またはやさしくされたことについて書きましょう。"
};

type ReviewScoreKey = keyof ReviewScoreBreakdownDto;

const scoreLabels: Record<ReviewScoreKey, string> = {
  topicRelation: "題名との関係",
  taskUnderstanding: "課題理解",
  structure: "構成",
  specificity: "具体性",
  expression: "表現",
  grammarAndNotation: "表記",
  readerAwareness: "読み手意識"
};

type NavigationMode = "push" | "replace";
type UploadImage = {
  dataUrl: string;
  contentType: string;
  fileName: string;
  label: string;
};

type EssayCoachHistoryState = {
  essayCoachRoute?: AppRoute;
  canGoBack?: boolean;
};

function App() {
  const [route, setRoute] = useState<AppRoute>(() => parseAppRouteHash(window.location.hash));
  const [strictness, setStrictness] = useState<ReviewStrictness>("easy");
  const [backfilledSubmissionDay, setBackfilledSubmissionDay] = useState<number | null>(null);
  const [uploadImage, setUploadImage] = useState<UploadImage | null>(null);
  const [monthSubmissionDays, setMonthSubmissionDays] = useState<MvpMonthSubmissionDay[]>([]);
  const [latestSubmissionResult, setLatestSubmissionResult] = useState<MvpSubmissionResult | null>(null);
  const [reviewProcessStatus, setReviewProcessStatus] = useState<ReviewJobStatusDto | null>(null);
  const [isProcessingReview, setIsProcessingReview] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 31 }, (_, index) => index + 1), []);
  const { page, selectedDay, submissionDate } = route;
  const latestInMemorySubmissionDay = latestSubmissionResult
    ? submissionDayFromDate(latestSubmissionResult.essayDay.date, calendarYear, calendarMonth, selectedDay)
    : backfilledSubmissionDay;
  const restoredSubmissionResult = selectMvpSubmissionResultForDay(monthSubmissionDays, selectedDay);
  const activeSubmissionResult =
    latestSubmissionResult && selectedDay === latestInMemorySubmissionDay ? latestSubmissionResult : restoredSubmissionResult;
  const review = activeSubmissionResult?.review;
  const activeSubmissionHistory = activeSubmissionResult?.submissionHistory ?? [];
  const characterTarget = review ? calculateCharacterTarget(review.ocrText) : undefined;
  const hasSubmission = Boolean(activeSubmissionResult);

  useEffect(() => {
    const initialRoute = parseAppRouteHash(window.location.hash);
    setRoute(initialRoute);
    writeHistoryRoute(initialRoute, "replace");

    const restoreRoute = () => {
      setRoute(parseAppRouteHash(window.location.hash));
    };

    window.addEventListener("popstate", restoreRoute);
    return () => window.removeEventListener("popstate", restoreRoute);
  }, []);

  useEffect(() => {
    let isCurrent = true;

    getMvpMonthSubmissions({ year: calendarYear, month: calendarMonth })
      .then((result) => {
        if (isCurrent) setMonthSubmissionDays(result.days);
      })
      .catch((error) => {
        if (isCurrent) {
          setSubmissionError(error instanceof Error ? error.message : "提出済み一覧の取得に失敗しました。");
        }
      });

    return () => {
      isCurrent = false;
    };
  }, []);

  const navigate = (nextRoute: AppRoute, mode: NavigationMode = "push") => {
    setRoute(nextRoute);
    writeHistoryRoute(nextRoute, mode);
  };

  const goBack = () => {
    const historyState = window.history.state as EssayCoachHistoryState | null;

    if (historyState?.canGoBack) {
      window.history.back();
      return;
    }

    navigate(defaultAppRoute, "replace");
  };

  const openDetailForDay = (day: number) => {
    navigate({
      page: "detail",
      selectedDay: day,
      submissionDate: formatSubmissionDate(calendarYear, calendarMonth, day)
    });
  };

  const openUploadForDay = (day: number) => {
    navigate({
      page: "upload",
      selectedDay: day,
      submissionDate: formatSubmissionDate(calendarYear, calendarMonth, day)
    });
  };

  const handleFileSelected = async (file: File | undefined) => {
    setSubmissionError(null);
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setUploadImage(null);
      setSubmissionError("画像ファイルを選んでください。");
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setUploadImage({
        dataUrl,
        contentType: file.type,
        fileName: file.name,
        label: file.name
      });
    } catch (error) {
      setUploadImage(null);
      setSubmissionError(error instanceof Error ? error.message : "画像の読み込みに失敗しました。");
    }
  };

  const submitForReview = async () => {
    if (!uploadImage) {
      setSubmissionError("提出する画像を選んでください。");
      return;
    }

    setIsProcessingReview(true);
    setReviewProcessStatus("queued");
    setSubmissionError(null);
    try {
      const result = await submitMvpSubmission({
        date: submissionDate,
        strictness,
        fileName: uploadImage.fileName,
        contentType: uploadImage.contentType,
        imageDataUrl: uploadImage.dataUrl
      });
      const submittedDay = submissionDayFromDate(result.essayDay.date, calendarYear, calendarMonth, selectedDay);

      setLatestSubmissionResult(result);
      setBackfilledSubmissionDay(submittedDay);
      setReviewProcessStatus(result.processStatus);

      const completedResult =
        result.processStatus === "completed" ? result : await pollSubmissionUntilFinished(result.submission.id, setReviewProcessStatus);
      const completedDay = submissionDayFromDate(completedResult.essayDay.date, calendarYear, calendarMonth, submittedDay);
      setLatestSubmissionResult({
        ...completedResult,
        imagePreviewUrl: result.imagePreviewUrl
      });
      setMonthSubmissionDays((current) => mergeMonthSubmissionDay(current, completedResult));
      setReviewProcessStatus(completedResult.processStatus);

      if (completedResult.processStatus === "failed") {
        throw new Error("レビュー作成に失敗しました。時間をおいてもう一度提出してください。");
      }

      navigate({
        page: "review",
        selectedDay: completedDay,
        submissionDate: completedResult.essayDay.date
      });
    } catch (error) {
      setReviewProcessStatus("failed");
      setSubmissionError(error instanceof Error ? error.message : "レビュー作成に失敗しました。");
    } finally {
      setIsProcessingReview(false);
    }
  };

  const getCalendarDayResult = (day: number) =>
    latestSubmissionResult && day === latestInMemorySubmissionDay
      ? latestSubmissionResult
      : selectMvpSubmissionResultForDay(monthSubmissionDays, day);

  const getCalendarDayStatus = (day: number, dayResult: MvpSubmissionResult | undefined) =>
    day === latestInMemorySubmissionDay && reviewProcessStatus && reviewProcessStatus !== "completed"
      ? reviewProcessStatus
      : dayResult?.processStatus;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>Essay Coach</h1>
        <button className={page === "calendar" ? "active" : ""} onClick={() => navigate(defaultAppRoute)}>
          <CalendarDays size={18} /> Calendar
        </button>
        <button
          className={page === "detail" ? "active" : ""}
          onClick={() => openDetailForDay(17)}
        >
          <FileImage size={18} /> Essay
        </button>
        <button
          className={page === "upload" ? "active" : ""}
          onClick={() =>
            navigate({
              page: "upload",
              selectedDay: 17,
              submissionDate: todaySubmissionDate
            })
          }
        >
          <Upload size={18} /> Upload
        </button>
        <button
          className={page === "review" ? "active" : ""}
          onClick={() =>
            navigate({
              page: "review",
              selectedDay,
              submissionDate
            })
          }
        >
          <Gauge size={18} /> Review
        </button>
      </aside>

      <section className="workspace">
        {page !== "calendar" && (
          <button className="back-link" onClick={goBack}>
            <ChevronLeft size={18} /> 戻る
          </button>
        )}
        {page === "calendar" && (
          <>
            <PageHeader title="2026年5月" subtitle="1日1枚の作文提出を確認します。" />
            <div className="calendar-grid">
              {days.map((day) => {
                const dayResult = getCalendarDayResult(day);
                const status = getCalendarDayStatus(day, dayResult);

                return (
                <button
                  key={day}
                  className={day === selectedDay ? "day selected" : "day"}
                  onClick={() => openDetailForDay(day)}
                >
                  <span>{day}</span>
                  {dayResult && (
                    <span className="day-badges">
                      <strong>画像あり</strong>
                      {status && status !== "completed" ? (
                        <strong>{getMvpReviewStatusMessage(status)}</strong>
                      ) : (
                        <>
                          <strong>レビュー済み</strong>
                          {dayResult.review && <strong>{dayResult.review.totalScore}点</strong>}
                        </>
                      )}
                    </span>
                  )}
                </button>
                );
              })}
            </div>
          </>
        )}

        {page === "detail" && (
          <>
            <PageHeader title={`5月${selectedDay}日の作文`} subtitle="日付ごとの提出画像とレビューを確認します。" />
            {hasSubmission && review && characterTarget ? (
              <div className="detail-layout">
                <section>
                  <TopicPanel />
                  {activeSubmissionResult?.imagePreviewUrl && (
                    <EssayImagePreview title="提出画像: 最新の実提出" imageUrl={activeSubmissionResult.imagePreviewUrl} />
                  )}
                </section>
                <section className="detail-summary">
                  <span className="status-pill">レビュー済み</span>
                  <h3>提出 {activeSubmissionHistory.length}件</h3>
                  <p>最新提出: {activeSubmissionResult?.submission.attemptNumber}回目</p>
                  <p>レビュー状態: {getMvpReviewStatusMessage(activeSubmissionResult?.processStatus ?? "completed")}</p>
                  <SubmissionHistoryTable history={activeSubmissionHistory} />
                  <CharacterTargetPanel result={characterTarget} />
                  <div className="mini-review">
                    <strong>{review.totalScore}/100</strong>
                    <p>{review.childFriendlyComment}</p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => {
                      navigate({
                        page: "review",
                        selectedDay,
                        submissionDate: formatSubmissionDate(calendarYear, calendarMonth, selectedDay)
                      });
                    }}
                  >
                    レビュー全体を見る
                  </button>
                  <button className="secondary" onClick={() => openUploadForDay(selectedDay)}>
                    書き直しを提出
                  </button>
                </section>
              </div>
            ) : (
              <section className="empty-state">
                <h3>この日の提出はまだありません</h3>
                <p>作文を書いたら、画像を提出してレビューを受けられます。</p>
                <button className="primary" onClick={() => openUploadForDay(selectedDay)}>
                  作文画像を提出
                </button>
              </section>
            )}
          </>
        )}

        {page === "upload" && (
          <>
            <PageHeader title="作文画像を提出" subtitle="題名にそって書いても、別のことを書いてもかまいません。" />
            <TopicPanel />
            <div className="upload-panel">
              <label className="date-field">
                提出日
                <input
                  type="date"
                  value={submissionDate}
                  max={todaySubmissionDate}
                  onChange={(event) => navigate(routeFromSubmissionDate("upload", event.target.value, selectedDay), "replace")}
                />
                <small>過去の日付の作文も、あとから提出できます。</small>
              </label>
              <label>
                きびしさ
                <div className="segmented">
                  <button className={strictness === "easy" ? "selected" : ""} onClick={() => setStrictness("easy")}>
                    Easy（学年別・学習指導要領）
                  </button>
                  <button className={strictness === "hard" ? "selected" : ""} onClick={() => setStrictness("hard")}>
                    Hard（都立型中学受験）
                  </button>
                </div>
                <small>
                  デフォルトは小学6年生。Easyは東京都の学習指導要領に沿った学年別観点、Hardは都立型中学受験の観点と一段高度な語彙を加えます。
                </small>
              </label>
              <label className="drop-zone">
                <Upload size={24} />
                <span>{uploadImage ? uploadImage.label : "画像を選択するとプレビューを表示します"}</span>
                <input type="file" accept="image/*" onChange={(event) => void handleFileSelected(event.target.files?.[0])} />
              </label>
              {uploadImage && (
                <EssayImagePreview title={`選択した画像プレビュー: ${uploadImage.label}`} imageUrl={uploadImage.dataUrl} />
              )}
              {submissionError && <p className="error-message">{submissionError}</p>}
              {reviewProcessStatus && isProcessingReview && (
                <p className="source-note">{getMvpReviewStatusMessage(reviewProcessStatus)}</p>
              )}
              <button
                className="primary"
                disabled={!uploadImage || isProcessingReview}
                onClick={() => void submitForReview()}
              >
                {isProcessingReview ? "レビューを作成中..." : "提出してレビューへ"}
              </button>
            </div>
          </>
        )}

        {page === "review" && (
          <>
            <PageHeader title="レビュー結果" subtitle={`提出日: ${submissionDate} / OCR、採点、書き直しアドバイスを確認します。`} />
            {review && characterTarget ? (
              <div className="review-layout">
                <section className="review-main">
                  {activeSubmissionResult?.imagePreviewUrl && (
                    <EssayImagePreview title="提出画像: 最新の実提出" imageUrl={activeSubmissionResult.imagePreviewUrl} />
                  )}
                  <div className="score">{review.totalScore}<span>/100</span></div>
                  <p>{review.childFriendlyComment}</p>
                  <CharacterTargetPanel result={characterTarget} />
                  <h2>文字数へのコメント</h2>
                  <p>文字数目標は400字です。今は{characterTarget.current}字なので、くわしい場面や気持ちを足してみましょう。</p>
                  <h2>OCR</h2>
                  <p>{review.ocrText}</p>
                  <h2>題名との関係</h2>
                  <p>{review.topicComment}</p>
                  <h2>保護者向け</h2>
                  <p>{review.parentSummary}</p>
                  <ReviewList title="よいところ" items={review.strengths} />
                  <ReviewList title="直すとよいところ" items={review.improvementPoints} />
                  <ReviewList title="書き直しのヒント" items={review.rewriteAdvice} />
                </section>
                <section className="breakdown">
                  {(Object.entries(review.scores) as Array<[string, number]>).map(([name, value]) => (
                    <div key={name}>
                      <span>{scoreLabels[name as ReviewScoreKey]}</span>
                      <strong>{value}</strong>
                    </div>
                  ))}
                </section>
              </div>
            ) : (
              <section className="empty-state">
                <h3>レビューはまだありません</h3>
                <p>作文画像を提出すると、Hermesがレビューを作成します。</p>
                <button className="primary" onClick={() => openUploadForDay(selectedDay)}>
                  作文画像を提出
                </button>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}

function PageHeader(props: { title: string; subtitle: string }) {
  return (
    <header className="page-header">
      <h2>{props.title}</h2>
      <p>{props.subtitle}</p>
    </header>
  );
}

function TopicPanel() {
  return (
    <section className="topic-panel">
      <span>今日の題名</span>
      <h3>{topic.title}</h3>
      <p>{topic.prompt}</p>
      <small>題名にそって書くことは任意です。レビューでは題名との関係もコメントします。</small>
    </section>
  );
}

function EssayImagePreview(props: { title: string; imageUrl: string }) {
  return (
    <figure className="essay-preview">
      <figcaption>{props.title}</figcaption>
      <img src={props.imageUrl} alt={`${props.title}の手書き作文プレビュー`} />
    </figure>
  );
}

function ReviewList(props: { title: string; items: string[] }) {
  return (
    <>
      <h2>{props.title}</h2>
      <ul className="review-list">
        {props.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}

function SubmissionHistoryTable(props: { history: MvpSubmissionHistoryItem[] }) {
  return (
    <section className="submission-history" aria-label="投稿履歴">
      <h4>投稿履歴</h4>
      <table>
        <thead>
          <tr>
            <th scope="col">投稿日時</th>
            <th scope="col">得点</th>
          </tr>
        </thead>
        <tbody>
          {props.history.map((item) => (
            <tr key={item.submission.id}>
              <td>{formatSubmissionDateTime(item.submission.submittedAt)}</td>
              <td>{item.score === undefined ? "採点待ち" : `${item.score}点`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function formatSubmissionDateTime(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function CharacterTargetPanel(props: { result: ReturnType<typeof calculateCharacterTarget> }) {
  return (
    <section className="character-target" aria-label="文字数目標">
      <span>文字数目標: {props.result.target}字</span>
      <strong>
        現在: {props.result.current}字 / {props.result.target}字
      </strong>
      <p>{props.result.resultText}</p>
    </section>
  );
}

function mergeMonthSubmissionDay(days: MvpMonthSubmissionDay[], result: MvpSubmissionResult): MvpMonthSubmissionDay[] {
  const nextDay: MvpMonthSubmissionDay = {
    essayDay: result.essayDay,
    latestSubmission: result.submission,
    review: result.review,
    submissionHistory: result.submissionHistory,
    processStatus: result.processStatus
  };
  const nextDays = days.filter((day) => day.essayDay.date !== result.essayDay.date);
  nextDays.push(nextDay);
  return nextDays.sort((a, b) => a.essayDay.date.localeCompare(b.essayDay.date));
}

async function pollSubmissionUntilFinished(
  submissionId: string,
  onStatus: (status: ReviewJobStatusDto) => void
): Promise<MvpSubmissionResult> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    await delay(1000);
    const result = await getMvpSubmissionStatus(submissionId);
    onStatus(result.processStatus);
    if (result.processStatus === "completed" || result.processStatus === "failed") return result;
  }

  throw new Error("レビュー作成が時間内に完了しませんでした。");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

function writeHistoryRoute(route: AppRoute, mode: NavigationMode) {
  const previousState = window.history.state as EssayCoachHistoryState | null;
  const state: EssayCoachHistoryState = {
    essayCoachRoute: route,
    canGoBack: mode === "push" || Boolean(previousState?.canGoBack)
  };
  const url = `${window.location.pathname}${window.location.search}${formatAppRouteHash(route)}`;

  if (mode === "replace") {
    window.history.replaceState(state, "", url);
    return;
  }

  window.history.pushState(state, "", url);
}
