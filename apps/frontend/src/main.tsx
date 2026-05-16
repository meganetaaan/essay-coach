import { StrictMode, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { CalendarDays, FileImage, Gauge, Upload } from "lucide-react";
import type { ReviewDto, ReviewScoreBreakdownDto, ReviewStrictness } from "@essay-coach/contracts";
import "./styles.css";

const topic = {
  id: "kindness",
  title: "やさしさについて",
  prompt: "だれかにやさしくしたこと、またはやさしくされたことについて書きましょう。"
};

const scores: ReviewScoreBreakdownDto = {
  topicRelation: 8,
  taskUnderstanding: 17,
  structure: 12,
  specificity: 16,
  expression: 12,
  grammarAndNotation: 8,
  readerAwareness: 8
};

const review: ReviewDto = {
  id: "review-1",
  submissionId: "submission-1",
  strictness: "easy",
  ocrText: "今日は友だちがこまっていたので、声をかけました。少しうれしい気持ちになりました。",
  totalScore: 81,
  scores,
  topicComment: "題名の「やさしさ」と、友だちに声をかけた経験がつながっています。",
  strengths: ["できごとが順番に書けています。", "そのときの気持ちが伝わります。"],
  improvementPoints: ["友だちがどう困っていたのかを足すと、場面がもっと見えます。"],
  rewriteAdvice: ["はじめに場面を一文足してから、自分の行動と気持ちを書きましょう。"],
  childFriendlyComment: "やさしい行動を思い出して書けました。つぎは、くわしい場面も書いてみましょう。",
  parentSummary: "具体例をもう少し補うと、受検作文に近い説明力が伸びます。",
  rawOutput: {},
  createdAt: new Date().toISOString()
};

type Page = "calendar" | "detail" | "upload" | "review";

function App() {
  const [page, setPage] = useState<Page>("calendar");
  const [strictness, setStrictness] = useState<ReviewStrictness>("easy");
  const days = useMemo(() => Array.from({ length: 31 }, (_, index) => index + 1), []);

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <h1>Essay Coach</h1>
        <button className={page === "calendar" ? "active" : ""} onClick={() => setPage("calendar")}>
          <CalendarDays size={18} /> Calendar
        </button>
        <button className={page === "detail" ? "active" : ""} onClick={() => setPage("detail")}>
          <FileImage size={18} /> Essay
        </button>
        <button className={page === "upload" ? "active" : ""} onClick={() => setPage("upload")}>
          <Upload size={18} /> Upload
        </button>
        <button className={page === "review" ? "active" : ""} onClick={() => setPage("review")}>
          <Gauge size={18} /> Review
        </button>
      </aside>

      <section className="workspace">
        {page === "calendar" && (
          <>
            <PageHeader title="2026年5月" subtitle="1日1枚の作文提出を確認します。" />
            <div className="calendar-grid">
              {days.map((day) => (
                <button key={day} className={day === 17 ? "day selected" : "day"} onClick={() => setPage("detail")}>
                  <span>{day}</span>
                  {day === 17 && <strong>レビュー済み</strong>}
                </button>
              ))}
            </div>
          </>
        )}

        {page === "detail" && (
          <>
            <PageHeader title="5月17日の作文" subtitle="今日の題名はランダムに選ばれました。" />
            <TopicPanel />
            <div className="status-row">
              <span>最新提出: 1回目</span>
              <span>レビュー状態: completed</span>
              <button onClick={() => setPage("upload")}>書き直しを提出</button>
            </div>
          </>
        )}

        {page === "upload" && (
          <>
            <PageHeader title="作文画像を提出" subtitle="題名にそって書いても、別のことを書いてもかまいません。" />
            <TopicPanel />
            <div className="upload-panel">
              <label>
                きびしさ
                <div className="segmented">
                  <button className={strictness === "easy" ? "selected" : ""} onClick={() => setStrictness("easy")}>
                    Easy
                  </button>
                  <button className={strictness === "hard" ? "selected" : ""} onClick={() => setStrictness("hard")}>
                    Hard
                  </button>
                </div>
              </label>
              <label className="drop-zone">
                <Upload size={24} />
                <span>画像を選択</span>
                <input type="file" accept="image/*" />
              </label>
              <button className="primary" onClick={() => setPage("review")}>
                提出してレビューへ
              </button>
            </div>
          </>
        )}

        {page === "review" && (
          <>
            <PageHeader title="レビュー結果" subtitle="OCR、採点、書き直しアドバイスを確認します。" />
            <div className="review-layout">
              <section className="review-main">
                <div className="score">{review.totalScore}<span>/100</span></div>
                <p>{review.childFriendlyComment}</p>
                <h2>OCR</h2>
                <p>{review.ocrText}</p>
                <h2>題名との関係</h2>
                <p>{review.topicComment}</p>
                <h2>保護者向け</h2>
                <p>{review.parentSummary}</p>
              </section>
              <section className="breakdown">
                {(Object.entries(review.scores) as Array<[string, number]>).map(([name, value]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </section>
            </div>
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
