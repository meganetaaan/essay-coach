import { describe, expect, it } from "vitest";
import { calculateCharacterTarget } from "./character-target";

describe("calculateCharacterTarget", () => {
  it("reports progress toward the 400 character target", () => {
    expect(calculateCharacterTarget("あ".repeat(312))).toEqual({
      current: 312,
      target: 400,
      remaining: 88,
      reached: false,
      resultText: "目標まであと88字"
    });
  });

  it("does not report negative remaining characters after reaching the target", () => {
    expect(calculateCharacterTarget("あ".repeat(405))).toMatchObject({
      current: 405,
      remaining: 0,
      reached: true,
      resultText: "目標を達成しています"
    });
  });

  it("ignores whitespace when counting essay characters", () => {
    expect(calculateCharacterTarget("あ い\nう")).toMatchObject({
      current: 3,
      remaining: 397
    });
  });
});
