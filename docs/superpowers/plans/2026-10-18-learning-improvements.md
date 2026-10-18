# SafeSpend Learning Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Learn a clear, source-linked beginner journey with meaningful saved practice, varied knowledge checks, responsive missions and optional lesson-aware Fin help.

**Architecture:** Extend the existing Expo screens and Supabase learning records. Put quiz selection/scoring and practice completion behind authenticated PostgreSQL functions; keep ordinary goals and mission self-reporting distinct. Fin receives a validated published lesson selector through its existing authenticated API.

**Tech Stack:** Expo 57, React Native, TypeScript, Supabase PostgreSQL, existing direct OpenAI SDK backend, Node test runner and PGlite. No new dependencies.

**Spec:** [Approved design](../specs/2026-10-18-learning-improvements-design.md).

## Global Constraints

- Preserve Poppins, mint and deep teal, existing navigation and guided-tour replay.
- “Works without AI” still requires the existing connection to load and save learning data.
- “This is a plan, not proof of money saved.” Mission completion remains explicitly self-reported.
- Start with two reviewed sets of three questions per topic; pass requires two correct answers.
- Preserve existing progress, goals and attempts. Label historical unverified action completion as legacy progress.
- Every new learner record is owner-scoped and cascades on account deletion; no client-supplied user ID controls authorization.
- Do not add bank verification, automatic transfers, debt payment execution, leaderboards, certificates, a course marketplace or an offline content cache.
- Preserve Fin's saved-record lookup requirement, consent checks, quotas and read-only financial safeguards.
- Existing checkout contains substantial earlier uncommitted work. Preserve it; do not reset, stash indiscriminately or commit unrelated changes. Task commit checkpoints below require selective hunks and available Git permission; otherwise leave reviewed changes uncommitted and report that.
- During execution, use the installed Supabase documentation workflow before SQL changes; generate new migration names with the CLI and run actual migration tests. Never edit an already-deployed migration.

## Review Focus

1. Double-tap/retry after a lost network response: one active quiz and one immutable score, without duplicate completion or goals. Owned by Tasks 1 and 2 tests.
2. Content changes while a quiz is open: score the persisted content version, never today's replacement answer key. Owned by Task 1 tests.
3. App restart or account switch during practice: recover the current owner's saved exercise; never complete another owner's work. Owned by Tasks 2 and 5 tests.
4. A device outside Malaysia crossing Sunday/Monday: mission and practice periods follow Asia/Kuala_Lumpur consistently. Owned by Tasks 2 and 3 tests.
5. Existing Fin draft/history when lesson help opens: require explicit context switching, preserve the draft and never send automatically. Owned by Task 6 tests.

## File and dependency map

- New migrations, generated in task order: private question versions and quiz attempts; practice/progress controls; learner preferences and adaptive missions; reviewed curriculum updates. Tasks 1–3 establish interfaces consumed by Tasks 4–6.
- `types/learning.ts`: public payload, attempt, feedback, practice, focus and selection-reason types. Public question type contains no answer key.
- `utils/learning-action.ts`: replace generic goal inference with bounded practice-draft validation and server result handling; update every current caller and test.
- New `utils/learning-journey.ts`: pure next-step selection and Malaysia learning-period helpers, shared by Learn screens. Do not create a generic workflow framework.
- New `components/learning-practice.tsx`: three focused exercise forms and saved/legacy status, used inside the existing path screen.
- `app/learning-path-details.tsx`: integrate lesson acknowledgement, resumable attempts, targeted feedback, saved practice and Fin links.
- `app/(tabs)/edufinance.tsx`, `components/weekly-money-mission-card.tsx`, `components/feature-guide.tsx`: dashboard order, optional focus, adaptive assignment explanation and honest completion copy.
- New `utils/fin-lesson-context.ts`: pure context/draft transition logic; `app/(tabs)/chatbot.tsx` consumes it.
- New `chatbot-backend/lib/fin-learning.js`: published safe lesson lookup; `chatbot-backend/lib/fin-chat.js` calls it. Update `app/privacy.tsx`, backend check script and deployment allowlist only if needed by actual packaging.
- Tests: extend `tests/learning.test.ts`; create `tests/learning-database.test.mjs`, `tests/learning-journey.test.ts`, `tests/fin-lesson-context.test.ts`, `chatbot-backend/tests/fin-learning.test.js`; extend the existing Fin handler tests.
- Documentation: new `docs/learning.md`, update the learning limitations in `docs/audit-remediation.md` and approved product context after verification.

## Task 1: Versioned quiz attempts and private answer keys

**Files:** new quiz migration; `types/learning.ts`; `tests/learning-database.test.mjs`; `tests/learning.test.ts`.

**Interfaces:**
- `start_learning_quiz(p_module_id uuid) returns jsonb`: `{attemptId,moduleId,version,setIndex,repeated,requiredCorrect:2,questions,feedback:null|QuizFeedback}`. Each question is `{id,prompt,options:[{id,label}]}`. If an active attempt exists, return that same attempt and stored option order.
- `submit_learning_quiz(p_attempt_id uuid,p_answers jsonb) returns jsonb`: `{attemptId,score,totalQuestions:3,passed,feedback:[{questionId,correctOptionId,explanation,lessonModuleId,slideIndex}]}`. Same submitted answers replay the stored result; different answers for a submitted attempt are rejected.
- `private.learning_quiz_sets`: `(module_id,version,set_index)` primary key, three full questions with answer/explanation and lesson pointers; no API-role access. Versions are immutable and retained for existing attempts.
- `public.user_learning_quiz_sessions`: UUID ID, owner, module, content version/set, safe question snapshot, submitted answers, result and timestamps. Owner SELECT only; unique active session per user/module. Keep the private set reference until the session is deleted. Mirror each completed session into `user_quiz_attempts` once using a unique nullable `session_id` column, preserving historical rows.
- `QuizQuestion` loses answer fields; `QuizAttempt` and `QuizFeedback` represent the above public responses.

- [ ] Write migration tests asserting authenticated users cannot read private keys; module payloads contain no `correctOptionId`/explanations; start twice returns the same ID/questions; concurrency cannot create two active sessions.
- [ ] Assert unknown/unpublished modules and another user's attempt fail; missing/extra question IDs and unknown options fail; 1/3 fails and 2/3 passes; no direct quiz-progress insertion is permitted.
- [ ] Assert submitting twice creates one history row; changing replayed answers fails; changing the current module version after start still scores the stored version; a failed retry never removes an earlier pass.
- [ ] Run `node --test tests/learning-database.test.mjs` and confirm new assertions fail for missing interfaces.
- [ ] Implement the schema/functions. Authenticated-only execute, fully qualified references, empty function search path, owner identity from `auth.uid()`, atomic row locking and stored option order. Choose an unseen set, then least-recently-seen set with a stable tie-breaker; set `repeated=true` after both sets were used.
- [ ] Move each existing quiz into private version 1/set 0, then seed version 1/set 1 with an alternative reviewed three-question scenario set covering the same concepts. Strip answer-bearing content from public quiz payloads; leave safe metadata `{version:1,requiredCorrect:2}`. Keep feedback private until submission.
- [ ] Replace the old `submit_quiz_attempt(uuid,jsonb)` body with an explicit `Update SafeSpend to continue this knowledge check` exception. Retain its signature for a clear old-client failure.
- [ ] Update guards/types and run focused tests, then `npm run test:database` and `npm run typecheck`. During the intermediate commit, old UI may need a guarded unavailable state until Task 4; never fall back to public answer keys.
- [ ] Checkpoint only this task's migration, types and tests after green verification.

## Task 2: Server-verified, resumable practice and honest progress

**Files:** new practice migration; `types/learning.ts`; `utils/learning-action.ts`; `tests/learning-database.test.mjs`; `tests/learning.test.ts`.

**Interfaces:**
- `begin_learning_practice(p_module_id uuid) returns jsonb`: owned `{moduleId,kind,period,draft,status:'draft'|'saved',goalId,budgetId}`; idempotent per user/module. Practice kind is derived from the published path: `budget`, `saving`, `debt`.
- `save_learning_practice(p_module_id uuid,p_draft jsonb,p_confirm boolean default false) returns jsonb`: saves a bounded partial draft; final confirmation validates the kind-specific fields and atomically records `plan_saved` progress. No caller-supplied owner, kind or period.
- Drafts: budget `{budgetId}`; saving `{targetAmount,contributionAmount,frequency:'weekly'|'monthly',firstStep}`; debt `{priority,strategy:'highest_cost'|'smallest_balance'|'avoid_new_debt',reason,hypothetical:boolean}`. Final text fields trim to 1–500 characters; amounts are positive finite decimal MYR values with at most two decimal places and at most 999999999.99. Reject unexpected fields, non-object payloads and payloads over 10KB.
- `public.user_learning_practice`: owner/module unique, server kind, Malaysia period, draft, saved timestamp and nullable linked goal/budget IDs. Owner SELECT only. Budget selection must refer to the owner's positive MYR budget for the current Malaysian month; explicit confirmation is required after returning from Budgets.
- `acknowledge_learning_lesson(p_module_id uuid) returns boolean`: authenticates and checks published lesson type before recording `lesson_viewed`.
- `user_path_progress.completion_basis`: `legacy`, `lesson_viewed`, `quiz_passed`, `plan_saved`; existing action rows become `legacy`, historical quiz passes remain `quiz_passed`. New RPCs set their own basis; revoke client INSERT/UPDATE on progress.

- [ ] Replace the test expecting “Plan groceries” to satisfy savings practice with a rejection test; retain cancelled-navigation, wrong-owner, invalid-amount, wrong-period and database-failure regressions against the new interface.
- [ ] Add actual SQL tests: unrelated goals never qualify; wrong module kind and forged evidence fail; saving/debt final validation is enforced; partial drafts survive reload; user B cannot read/write user A's exercise; direct completion insertion/update fails.
- [ ] Assert saved-plan retry creates one linked weekly goal for savings/debt, preserves unrelated goals and permits hypothetical debt practice without inventing a balance. Goal title/notes are generated from validated structured fields; goal checkbox never changes completion basis.
- [ ] Assert Malaysia periods at boundary timestamps, explicit budget confirmation, current-month evidence checks and preserved legacy rows. An unsaved draft crossing a period boundary must be revalidated against the new period before final confirmation; an already saved plan remains historical evidence.
- [ ] Run focused tests to establish red, implement the schema/RPCs and replace the generic inference helper, then run `npm test` and `npm run test:database` to green. Update both existing screen callers to stop invoking removed helper signatures, leaving Task 5 to supply the complete form UI.
- [ ] Checkpoint this task's migration, helper, caller adaptations, types and tests selectively.

## Task 3: Learner focus, next-step selection and responsive missions

**Files:** new mission migration; `utils/learning-journey.ts`; `types/learning.ts`; `tests/learning-database.test.mjs`; `tests/learning-journey.test.ts`.

**Interfaces:**
- `public.user_learning_preferences`: owner primary key, `focus` nullable enum `spending|saving|debt`, updated timestamp, owner SELECT only.
- `set_learning_focus(p_focus text) returns text`: validates enum or null and upserts own preference.
- Existing `assign_weekly_money_mission() returns uuid` keeps its signature. Add `selection_reason` enum `existing|quiz_review|chosen_focus|next_path|rotation` to assignments, defaulting old rows to `existing`.
- `learningPeriod(now:Date):{monthStart:string,weekStart:string}` uses Malaysia calendar dates independently of device zone.
- `chooseLearningNextStep(paths,progress,latestAttempts,focus):{pathId,moduleId,reason}|null`: failed check without a later passing attempt first, then unfinished chosen-focus path, then first unfinished path in authored order; all complete returns null. Shared types live in `types/learning.ts`.

- [ ] Add tests for no-history start, chosen focus, unresolved failure, a later pass resolving failure, all complete, missing/unpublished modules and stable ordering. Add Malaysia Monday/month boundary assertions.
- [ ] Add SQL tests for the spec's four mission priorities; match topics using `money-basics→spending`, `emergency-savings→saving`, `debt-bnpl→debt`. Resolve failed attempts by module and later passed history, including preserved historical attempts.
- [ ] Assert within a topic that never-assigned wins, then least-recently-assigned, then `rotation_order,id`; unavailable topic falls through to the next priority. Existing current-week assignment and history remain unchanged after focus/results change; concurrent assignment returns one row.
- [ ] Establish red with focused commands, implement the helper and migration, then run `node --experimental-strip-types --test tests/learning-journey.test.ts` and `node --test tests/learning-database.test.mjs` to green.
- [ ] Checkpoint this task's files selectively.

## Task 4: Knowledge-check UI, beginner content and targeted feedback

**Files:** `app/learning-path-details.tsx`; `types/learning.ts`; new curriculum migration; `tests/learning.test.ts`; `docs/learning.md`.

**Consumes:** Task 1 attempt and submission RPCs, Task 2 lesson acknowledgement, existing `EvidenceSection` and lesson/source structures.
**Produces:** A path screen that resumes an active attempt, shows `2 of 3 correct to pass`, reveals feedback only after submission, links mistakes to the matching lesson slide and starts a different set on explicit retry.

- [ ] Add payload-guard tests for safe questions and feedback with missing/invalid identifiers, options or slide indices. Assert old answer-bearing quiz payloads cannot become the new attempt contract.
- [ ] Run `node --experimental-strip-types --test tests/learning.test.ts` for red, then replace fixed-payload rendering and the old quiz RPC. Keep an in-flight guard and disable submission during requests; preserve chosen answers after a network failure. Fetch/recover submitted result after ambiguous response loss before enabling a retry.
- [ ] Add lesson/feedback jump controls and explicit `This practice set has been used before` copy when repeated. Keep old progress visible and later practice failure separate from prior completion. Check current user on resumed screen loads.
- [ ] Add a content migration updating first-pay examples in the existing lessons while preserving IDs, source links, reviewed limitations and historical question versions. Treat all sample amounts as hypothetical; use no new statutory rates or prescriptive universal percentages. Document the question review and source mapping in `docs/learning.md`.
- [ ] Run focused tests, `npm run typecheck` and `npm run lint` to green; inspect path success/failure/retry and feedback navigation in the UI during Task 7's bounded visual check.
- [ ] Checkpoint the path-screen hunks, content migration, tests and documentation selectively.

## Task 5: Practice forms and the beginner dashboard

**Files:** `components/learning-practice.tsx`; `app/learning-path-details.tsx`; `app/(tabs)/edufinance.tsx`; `components/weekly-money-mission-card.tsx`; `components/feature-guide.tsx`; `utils/learning-action.ts`; `tests/learning.test.ts`; `tests/learning-journey.test.ts`.

**Consumes:** Tasks 2–3 practice, progress, preferences, period and next-step interfaces.
**Produces:** Three exercise forms embedded in the existing action step, a next-step panel and optional focus selector, plus assignment reason and self-reported mission labels.

- [ ] Add pure draft-validation tests for partial versus final fields, decimals/whitespace, hypothetical debt, excessive text and period changes. Add result-state tests distinguishing legacy, saved plan and self-reported completion; confirm server failure cannot become a local success.
- [ ] Establish red, then implement the forms using existing native controls, Poppins and brand colours. Persist explicit draft saves, offer resume/discard confirmation for edits, and submit final evidence through Task 2 RPC only. Never block progress solely because AI is disabled.
- [ ] For budget practice, show owned current-month budgets with an explicit selection/confirm action and an Open Budgets link. Reload after return and restore from the persisted exercise on cold start; visiting a budget screen never completes practice.
- [ ] For savings/debt, show the structured fields, hypothetical option and `Plan saved` state; show `Earlier progress` and an optional updated practice action for legacy completion. Recover the current owner's draft after restart and clear stale state during account changes.
- [ ] Reorder dashboard content to next step → paths → weekly mission → weekly goals; keep goal creation/toggling unchanged. Load saved focus/latest attempts/completion basis, use the shared next-step helper and explain the current mission's stored selection reason. Display no-data/loading/retry/all-complete states without fabricated progress.
- [ ] Update the three Learn tour descriptions and target positions to the new ordering while preserving help/replay behaviour. Add AI-independent sources and completion-boundary copy.
- [ ] Run `npm test`, `npm run typecheck` and `npm run lint` to green. Include native keyboard/safe-area/text-scaling and screen-reader controls in Task 7 checks.
- [ ] Checkpoint only this task's relevant hunks and tests.

## Task 6: Optional lesson-aware Fin tutoring

**Files:** `utils/fin-lesson-context.ts`; `tests/fin-lesson-context.test.ts`; `app/learning-path-details.tsx`; `app/(tabs)/chatbot.tsx`; `app/privacy.tsx`; `chatbot-backend/lib/fin-learning.js`; `chatbot-backend/lib/fin-chat.js`; `chatbot-backend/tests/fin-learning.test.js`; `chatbot-backend/tests/fin-chat-handler.test.js`; `chatbot-backend/package.json`; `docs/fin-coach.md`.

**Interfaces:**
- Chat POST gains optional `lessonContext:{moduleId:uuid,version:positive integer}`. No lesson body, answer key, route or user ID is accepted as authority.
- `loadFinLessonContext(selector,db=supabaseAdmin) -> Promise<{moduleId,version,pathId,title,slides,sourceTitles}|null>` in `fin-learning.js`: published lesson modules only, published path/time checks, exact version match, bounded validated teaching fields and source titles. Unknown, stale or non-lesson selector produces a clear 400/409 response before model execution.
- `applyFinLessonContext(currentContext,currentDraft,incoming):{context,draft,needsConfirmation}` in `utils/fin-lesson-context.ts`: keep nonempty drafts; a different incoming lesson requires explicit confirmation. Reopening the same context is idempotent.
- Navigation selector params are `lessonModuleId`, `lessonVersion`, `lessonPathId`; feedback points to its associated lesson module. `lessonPathId` is navigation convenience only; validate it against loaded context before returning. Backend returns safe context identity/title/path in the chat response so the client can replace untrusted display parameters.

- [ ] Add tests for invalid/unpublished/stale modules, inaccessible private quiz data, overlong/injection-like authored text and no client-controlled system role. Handler tests confirm existing lookup-before-answer and authenticated user isolation still hold with lesson context.
- [ ] Add transition tests preserving existing drafts/history, no auto-send, explicit switch confirmation, same-context reopening, clearing context and AI-consent denial restoring draft. Establish red with the focused Node test commands.
- [ ] Implement backend lookup and optional request schema field. Add reviewed context as delimited untrusted teaching data with a fixed instruction to explain concepts, never award completion or reveal quiz keys. Retain the existing lookup/tool/consent/limit behaviour; do not migrate SDKs.
- [ ] Add `Ask Fin about this lesson` to lesson/feedback screens. In Fin show a context chip, editable starter, clear/switch controls and return action. On context switch/clear, preserve messages visually but reset the model history boundary so an earlier lesson is not silently carried into new tutoring requests. Never overwrite a current draft or send on navigation.
- [ ] Update Privacy & data copy to disclose reviewed lesson context and preserve the AI guidance notice. Add `fin-learning.js` to the existing backend syntax-check script and verify deployment packaging includes it.
- [ ] Run `node --experimental-strip-types --test tests/fin-lesson-context.test.ts`, backend `npm test` and `npm run check`, then root `npm run typecheck` and `npm run lint` to green.
- [ ] Checkpoint this task's files selectively.

## Task 7: Integrated verification, review and release handoff

**Files:** `docs/learning.md`; `docs/audit-remediation.md`; `PRODUCT.md`; relevant fix files only if checks find defects.

**Consumes:** All previous tasks. **Produces:** tested reviewable changes and explicit deployment/native verification status.

- [ ] Run root `npm test`, `npm run test:database`, `npm run typecheck`, `npm run lint`, `npx expo export --platform web --output-dir dist`; run backend `npm test` and `npm run check`. Record actual results; stop and fix relevant failures before claiming completion.
- [ ] Use the actual app or clearly labelled component fixtures for one batched compact-phone and wider-screen visual pass: new/returning learner, quiz failure/retry, reopened practice, no debt/hypothetical, AI disabled, Fin existing draft, all complete and save errors. Fix found issues in one batch and confirm once. Remove temporary preview routes before the final export.
- [ ] Check existing account-deletion cascade tests with new learning rows: owner deletion removes sessions/practice/preferences and preserves another user's records. Verify no answer keys appear in API-readable module/session responses or frontend bundle data.
- [ ] Request one independent final code review through the installed review workflow. Resolve material findings with focused regressions; do not delegate implementation without the selected execution method.
- [ ] Update documentation with exact behaviour, limited two-set quiz bank, legacy progress meaning, self-reported mission boundary, AI/offline distinction, test results and checks that could not run. Update product context only to implemented, verified capabilities.
- [ ] Prepare migration order and backend/app release instructions. Hosted access was previously inconsistent: test access, then apply compatible migrations and backend before releasing the new app when deployment is authorized and available. Do not declare hosted success from local tests; report any blocked deployment precisely. Do not reset secrets or relink projects as a workaround.
- [ ] Present the final diff and verification evidence. Do not push unrelated work or publish a new app build without the user's release instruction.

## Plan self-review

Coverage checked against every approved spec section: Tasks 1/4 own checks and remediation; Tasks 2/5 own evidence, resume and legacy state; Tasks 3/5 own recommendations and missions; Task 6 owns optional Fin and privacy; Task 7 owns release/verification limits. Interfaces, question-count/pass values, enum values and ownership boundaries agree across tasks. All five Review Focus conditions have an explicit test step. No product-code change has been made during planning.

## Execution record

The user approved **native execution in this session**, followed by one independent final review, and subsequently authorized database/backend deployment and testing. The implementation, hosted release and signed-in Web checks are recorded in `docs/learning.md` and `docs/deployment-learning-2026-10-18.md`; the ignored execution ledger retains task evidence and rulings. Physical-device verification and mobile binary release remain outstanding. Existing uncommitted user work is preserved; no GitHub push was performed.
