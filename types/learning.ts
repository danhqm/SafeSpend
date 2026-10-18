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
};

export type QuizPayload = {
  version: number;
  requiredCorrect: 2;
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
  attemptId: string;
  score: number;
  totalQuestions: number;
  passed: boolean;
  feedback: QuizFeedback[];
};

export type QuizFeedback = { questionId: string; correctOptionId: string; explanation: string; lessonModuleId: string; slideIndex: number };
export type QuizAttempt = { attemptId: string; moduleId: string; version: number; setIndex: number; repeated: boolean; requiredCorrect: 2; questions: QuizQuestion[]; feedback: QuizResult | null; answers: Record<string,string> | null };
export type LearningFocus = 'spending' | 'saving' | 'debt';
export type CompletionBasis = 'legacy' | 'lesson_viewed' | 'quiz_passed' | 'plan_saved';
export type LearningProgress = { module_id: string; completion_basis: CompletionBasis };
export type LatestQuizAttempt = { module_id: string; passed: boolean; completed_at: string };
export type PracticeKind = 'budget' | 'saving' | 'debt';
export type PracticeDraft = { budgetId?: string; targetAmount?: string; contributionAmount?: string; frequency?: 'weekly' | 'monthly'; firstStep?: string; priority?: string; strategy?: 'highest_cost' | 'smallest_balance' | 'avoid_new_debt'; reason?: string; hypothetical?: boolean };
export type LearningPractice = { moduleId: string; kind: PracticeKind; period: string; draft: PracticeDraft; status: 'draft' | 'saved'; goalId: string | null; budgetId: string | null; confirmedDraft?: PracticeDraft|null; confirmedAt?: string|null };
export type MissionSelectionReason = 'existing' | 'quiz_review' | 'chosen_focus' | 'next_path' | 'rotation';

export type MoneyMissionCategory =
  | "spending"
  | "saving"
  | "debt"
  | "planning";

export type MoneyMissionTemplate = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  why_it_helps: string;
  steps: string[];
  category: MoneyMissionCategory;
  estimated_minutes: number;
  action_label: string | null;
  action_trigger: "home" | "add_transaction" | "budgets" | "goal" | null;
  rotation_order: number;
  reviewed_at: string;
  money_mission_sources?: ModuleSourceLink[];
};

export type WeeklyMoneyMission = {
  id: string;
  user_id: string;
  mission_id: string;
  week_start: string;
  completed_at: string | null;
  created_at: string;
  selection_reason?: MissionSelectionReason;
  money_mission_templates:
    | MoneyMissionTemplate
    | MoneyMissionTemplate[]
    | null;
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
  return Number.isInteger(payload.version) && Number(payload.version)>0 && payload.requiredCorrect===2;
}

export function isQuizAttempt(value: unknown): value is QuizAttempt {
  if(!value || typeof value!=='object') return false;
  const p=value as QuizAttempt;
  return typeof p.attemptId==='string' && typeof p.moduleId==='string' && Number.isInteger(p.version) && p.version>0 && p.requiredCorrect===2 &&
    Array.isArray(p.questions) && p.questions.length===3 &&
    p.questions.every(q=>q&&typeof q.id==='string' && typeof q.prompt==='string' && !('correctOptionId' in q) && !('explanation' in q) && Array.isArray(q.options) && q.options.length>=2 && q.options.every(o=>o&&typeof o.id==='string' && typeof o.label==='string') && new Set(q.options.map(o=>o.id)).size===q.options.length) && new Set(p.questions.map(q=>q.id)).size===3;
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

export function getLocalMonday(date = new Date()): Date {
  const monday = new Date(date);
  const difference = (monday.getDay() === 0 ? -6 : 1) - monday.getDay();
  monday.setDate(monday.getDate() + difference);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function missionFromAssignment(
  assignment: WeeklyMoneyMission,
): MoneyMissionTemplate | null {
  if (Array.isArray(assignment.money_mission_templates)) {
    return assignment.money_mission_templates[0] ?? null;
  }
  return assignment.money_mission_templates;
}

export function formatSourceType(source: LearningSource): string {
  if (source.source_type === "official") return "Official Malaysian source";
  if (source.source_type === "meta_analysis") return "Peer-reviewed meta-analysis";
  return "Peer-reviewed research";
}
