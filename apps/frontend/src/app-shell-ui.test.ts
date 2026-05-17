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
});
