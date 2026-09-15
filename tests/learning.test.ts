import assert from "node:assert/strict";
import test from "node:test";

import {
  computeLearningStreak,
  getLocalMonday,
  isQuizPayload,
  localLearningDate,
  missionFromAssignment,
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

test("weekly money missions use Monday as the local week boundary", () => {
  assert.equal(
    localLearningDate(getLocalMonday(new Date(2026, 8, 20, 18, 30))),
    "2026-09-14",
  );
  assert.equal(
    localLearningDate(getLocalMonday(new Date(2026, 8, 21, 0, 5))),
    "2026-09-21",
  );
});

test("weekly mission relation is normalized from Supabase nested rows", () => {
  const mission = {
    id: "mission-1",
    slug: "spending-snapshot",
    title: "Spending snapshot",
    summary: "See the week clearly.",
    why_it_helps: "Visibility supports a realistic plan.",
    steps: ["Record spending", "Review it"],
    category: "spending" as const,
    estimated_minutes: 10,
    action_label: null,
    action_trigger: null,
    rotation_order: 1,
    reviewed_at: "2026-09-15",
  };

  assert.equal(
    missionFromAssignment({
      id: "assignment-1",
      user_id: "user-1",
      mission_id: "mission-1",
      week_start: "2026-09-14",
      completed_at: null,
      created_at: "2026-09-15T00:00:00Z",
      money_mission_templates: [mission],
    })?.slug,
    "spending-snapshot",
  );
});
