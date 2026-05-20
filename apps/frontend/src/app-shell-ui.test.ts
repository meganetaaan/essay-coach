import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const appSource = readFileSync(join(process.cwd(), "src/main.tsx"), "utf8");

describe("Essay Coach app shell", () => {
  it("does not expose static sample review paths in the UI", () => {
    expect(appSource).not.toContain("レビューサンプル");
    expect(appSource).not.toContain("静的デモ");
    expect(appSource).not.toContain("静的サンプル");
    expect(appSource).not.toContain("比較用");
    expect(appSource).not.toContain("サンプル画像を確認");
  });

  it("renders calendar scores and detail submission history table labels", () => {
    expect(appSource).toContain("点");
    expect(appSource).toContain("投稿履歴");
    expect(appSource).toContain("投稿日時");
    expect(appSource).toContain("得点");
  });

  it("keeps calendar review state compact with icons/color and a visible score", () => {
    expect(appSource).not.toContain("<strong>画像あり</strong>");
    expect(appSource).not.toContain("<strong>レビュー済み</strong>");
    expect(appSource).toContain("ImageIcon");
    expect(appSource).toContain("CheckCircle2");
    expect(appSource).toContain("day-score");
  });

  it("defines smartphone app chrome with accessible app bar, drawer, and bottom tabs", () => {
    expect(appSource).toContain("app-bar");
    expect(appSource).toContain('aria-label="メニューを開く"');
    expect(appSource).toContain('aria-label="ドロワーメニュー"');
    expect(appSource).toContain('aria-label="メニューを閉じる"');
    expect(appSource).toContain("bottom-tab-bar");
    expect(appSource).toContain("カレンダー");
    expect(appSource).toContain("提出一覧");
  });

  it("exposes month selection, calendar/list switching, and recent submission navigation labels", () => {
    expect(appSource).toContain('type="month"');
    expect(appSource).toContain("表示月");
    expect(appSource).toContain("カレンダー表示");
    expect(appSource).toContain("リスト表示");
    expect(appSource).toContain("最近の提出状況");
    expect(appSource).toContain("詳細を見る");
  });

  it("fetches submissions for the visible route month instead of a hardcoded month", () => {
    expect(appSource).toContain("getMvpMonthSubmissions({ year: visibleYear, month: visibleMonth })");
    expect(appSource).not.toContain("getMvpMonthSubmissions({ year: calendarYear, month: calendarMonth })");
  });
});
