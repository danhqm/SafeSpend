export type LearningModuleType = "lesson" | "quiz" | "action";

export type LessonSlide = {
  title: string;
  body: string;
  takeaway?: string;
};

export type LessonPayload = {
  version: number;
  slides: LessonSlide[];
};

export type QuizOption = {
  id: string;
  label: string;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
};

export type QuizPayload = {
  version: number;
  passPercent: number;
  questions: QuizQuestion[];
};

export type ActionPayload = {
  version: number;
  description: string;
  buttonLabel: string;
};

export type LearningSource = {
  id: number;
  source_key: string;
  title: string;
  authors: string | null;
  publisher: string;
  publication_year: number | null;
  source_type: "official" | "peer_reviewed" | "meta_analysis";
  url: string;
  doi: string | null;
  jurisdiction: string;
  summary: string;
  limitations: string | null;
  reviewed_at: string;
};

export type ModuleSourceLink = {
  sort_order: number;
  evidence_note: string;
  content_sources: LearningSource | LearningSource[] | null;
};

export type LearningModule = {
  id: string;
  path_id: string;
  slug: string | null;
  title: string;
  module_type: LearningModuleType;
  content_payload: LessonPayload | QuizPayload | ActionPayload | null;
  action_trigger: string | null;
  sort_order: number;
  estimated_minutes: number;
  competency: string | null;
  learning_module_sources?: ModuleSourceLink[];
};

export type LearningPath = {
  id: string;
  slug: string | null;
  title: string;
  description: string | null;
  outcome: string | null;
  estimated_minutes: number;
  reviewed_at: string | null;
  sort_order: number;
};

export type QuizResult = {
  score: number;
  total_questions: number;
  passed: boolean;
};

export function isLessonPayload(value: unknown): value is LessonPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<LessonPayload>;
  return (
    Array.isArray(payload.slides) &&
    payload.slides.length > 0 &&
    payload.slides.every(
      (slide) =>
        Boolean(slide) &&
        typeof slide.title === "string" &&
        typeof slide.body === "string",
    )
  );
}

export function isQuizPayload(value: unknown): value is QuizPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<QuizPayload>;
  return (
    typeof payload.passPercent === "number" &&
    Array.isArray(payload.questions) &&
    payload.questions.length > 0 &&
    payload.questions.every(
      (question) =>
        Boolean(question) &&
        typeof question.id === "string" &&
        typeof question.prompt === "string" &&
        typeof question.correctOptionId === "string" &&
        typeof question.explanation === "string" &&
        Array.isArray(question.options) &&
        question.options.length >= 2,
    )
  );
}

export function isActionPayload(value: unknown): value is ActionPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ActionPayload>;
  return (
    typeof payload.description === "string" &&
    typeof payload.buttonLabel === "string"
  );
}

export function sourceFromLink(
  link: ModuleSourceLink,
): LearningSource | null {
  if (Array.isArray(link.content_sources)) {
    return link.content_sources[0] ?? null;
  }
  return link.content_sources ?? null;
}

export function localLearningDate(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDate(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

export function computeLearningStreak(
  dates: string[],
  today = new Date(),
): number {
  const completedDates = new Set(dates);
  let cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (!completedDates.has(localLearningDate(cursor))) {
    cursor = shiftDate(cursor, -1);
    if (!completedDates.has(localLearningDate(cursor))) return 0;
  }

  let streak = 0;
  while (completedDates.has(localLearningDate(cursor))) {
    streak += 1;
    cursor = shiftDate(cursor, -1);
  }
  return streak;
}

export function formatSourceType(source: LearningSource): string {
  if (source.source_type === "official") return "Official Malaysian source";
  if (source.source_type === "meta_analysis") return "Peer-reviewed meta-analysis";
  return "Peer-reviewed research";
}
