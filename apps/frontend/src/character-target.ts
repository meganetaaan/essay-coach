export const DEFAULT_CHARACTER_TARGET = 400;

export type CharacterTargetResult = {
  current: number;
  target: number;
  remaining: number;
  reached: boolean;
  resultText: string;
};

export function calculateCharacterTarget(text: string, target = DEFAULT_CHARACTER_TARGET): CharacterTargetResult {
  const current = Array.from(text.replace(/\s/g, "")).length;
  const remaining = Math.max(target - current, 0);
  const reached = remaining === 0;

  return {
    current,
    target,
    remaining,
    reached,
    resultText: reached ? "目標を達成しています" : `目標まであと${remaining}字`
  };
}
