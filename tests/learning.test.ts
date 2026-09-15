import assert from "node:assert/strict";
import test from "node:test";

import {
  computeLearningStreak,
  isQuizPayload,
} from "../types/learning.ts";

test("learning streak counts back from today without double counting", () => {
  const today = new Date(2026, 8, 15, 12, 0, 0);
  assert.equal(
    computeLearningStreak(
      ["2026-09-15", "2026-09-14", "2026-09-14", "2026-09-13"],
      today,
    ),
    3,
  );
});

test("learning streak remains active when the latest completion was yesterday", () => {
  const today = new Date(2026, 8, 15, 12, 0, 0);
  assert.equal(
    computeLearningStreak(["2026-09-14", "2026-09-13"], today),
    2,
  );
  assert.equal(computeLearningStreak(["2026-09-12"], today), 0);
});

test("quiz payload guard requires complete scenario questions", () => {
  assert.equal(
    isQuizPayload({
      version: 1,
      passPercent: 67,
      questions: [
        {
          id: "cash-flow",
          prompt: "What remains?",
          options: [
            { id: "a", label: "RM100" },
            { id: "b", label: "RM200" },
          ],
          correctOptionId: "b",
          explanation: "Subtract commitments from take-home income.",
        },
      ],
    }),
    true,
  );
  assert.equal(
    isQuizPayload({ version: 1, passPercent: 67, questions: [] }),
    false,
  );
});
