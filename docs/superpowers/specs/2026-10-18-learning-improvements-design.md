# SafeSpend Learn: understand, decide, apply

Status: approved by the user on 18 October 2026. No application or database changes made by this document.

## Outcome and audience

Improve the existing learning module so a beginner can choose a useful lesson, understand a money decision, and save a relevant next step. The proposed primary audience is Malaysian first-job earners; all paths remain available to other users. First-job positioning is a proposed default, not a user-research finding.

The user has approved fixing the weaknesses and pursuing the earlier improvement table. This document makes the proposed behaviour concrete before implementation. It does not claim measured learning or financial outcomes.

## Approach

Extend the existing three learning paths, native screens, progress records, weekly missions and Fin chat. This preserves source-linked content and avoids a second learning system. A cosmetic refresh alone leaves the completion and retry weaknesses intact. An AI-led course would make the core experience depend on consent, availability and model output; it is not the recommended approach.

| Area | Proposed change | Acceptance condition |
| --- | --- | --- |
| Beginner journey | A clear recommended next step, first-pay examples and visible Learn → Decide → Apply stages | A new user sees one starting action and can still browse all paths |
| Practice evidence | Match saved evidence to the specific skill and module | A grocery goal cannot complete emergency savings or debt practice |
| Knowledge checks | Reviewed question variants, server-created attempts and feedback on missed concepts | Retry uses a different scenario set when one is available; answer keys are not downloaded before submission |
| Help after mistakes | Explain the misconception, link the relevant lesson point, then offer a retry | A failed quiz does not strand the learner or merely repeat exposed answers |
| Weekly missions | Choose an appropriate mission using recent quiz results and an optional chosen focus | The interface explains why this mission was selected; assignment remains stable within its week |
| Optional Fin tutor | Let users ask about the current lesson using reviewed lesson context | No automatic message; existing consent applies; the full core journey works with AI disabled |
| Honest progress | Distinguish lesson viewed, check passed, plan saved and action self-reported | No saved plan or manual checkbox is presented as a verified transfer or repayment |

## Learner experience

Keep SafeSpend's Poppins, mint and deep-teal identity, existing navigation and guided-tour replay. The Learn dashboard prioritises a compact next-step panel, then the three paths, the weekly mission and weekly goals. Avoid a large new setup questionnaire. A learner can optionally choose spending, saving or debt as their focus and change it later.

Default to cash-flow basics when there is no history or chosen focus. Show the latest unresolved knowledge check as the next step before moving to a new path. Present a recommendation, not a locked curriculum. Retain readable source details and limitations in every path.

Use practical first-pay situations: money received versus committed expenses, building an initial buffer and comparing debt obligations. Example amounts must be explicitly hypothetical. Do not introduce unsourced statutory rates, product recommendations or fixed percentage rules presented as universally suitable.

## Practice and completion

- Budget practice checks an owned, positive current-month budget. The learner explicitly selects or saves that budget for this exercise; simply visiting Budgets is insufficient.
- Savings practice saves a module-linked plan with a positive target amount, a positive planned contribution, a contribution frequency and a short explanation of the first step. This is a plan, not proof of money saved.
- Debt practice saves a module-linked repayment priority, the chosen strategy and a short explanation. Allow hypothetical practice for users without debt; label it clearly. Do not require real creditor names or invent a debt balance.
- Keep ordinary weekly goals available. A generic title or a completion checkbox alone cannot qualify as learning evidence.
- Authenticate and validate evidence on the server. Client navigation parameters and client-side completion checks are not sufficient proof. Replace direct progress writes for checks and practice with narrowly scoped server operations; lesson acknowledgement may remain a distinct server-recorded event.
- Resume an unfinished exercise after navigation or app restart using saved state, rather than relying only on an in-memory pending-action reference.
- Preserve existing progress, goals and attempts. Label old unverified action completion as legacy progress; do not silently relabel it as newly verified evidence or erase it. Show an optional updated practice step for those learners.

## Knowledge checks and support

Seed reviewed question banks for the existing three topics. Begin with two sets of three questions per topic, covering the same competencies with different situations. Shuffle options without changing option identifiers. This is a small reviewed bank, not unlimited novelty; after both sets have been seen, disclose that a practice set is being repeated.

The server persists the selected question identifiers and content version before returning an attempt. Return prompts and options only. On submission, validate the owner, module, active attempt and exact expected question/option identifiers, score against the stored version, and return feedback only for that attempt. Repeated submission returns the same recorded result rather than adding a second attempt. Permit one active attempt per user/module so refreshes cannot reroll questions.

Use an explicit two-of-three pass rule and display it as such. Explain missed concepts and link back to the relevant lesson slide. Offer a different reviewed set on retry when available. Keep retry supportive, without lives, penalties or streak pressure. Saved history drives recommendations; a later failed practice retry does not erase an earlier pass.

Move answer keys out of readable module payloads and protect the new storage. Old app versions need an explicit update-required error for incompatible quiz calls, rather than a misleading score or access to private answer keys. Preserve prior attempt history for reference.

## Mission selection

Create one stable assignment per Malaysian Monday-based week. Preserve existing assignments and completion history. For future assignments, select in this order:

1. A published mission matching the most recent unresolved failed quiz topic.
2. A mission matching the learner's chosen focus.
3. A mission matching their next unfinished path.
4. The least recently assigned eligible mission, with a deterministic tie-breaker.

Within a topic, prefer a mission not recently assigned. Store the selection reason with the assignment and show a plain-language explanation such as “Practise the savings decision you found tricky.” Do not claim a user has debt or a spending problem based only on a quiz mistake. Do not replace an in-progress mission when a focus changes midweek.

Mission completion remains explicitly self-reported unless a specific saved action can be checked. Explain that boundary in the interface. Mission assignment and learning recommendations use saved learning records, not AI inference or hidden profiling.

## Optional Fin support

Add “Ask Fin about this lesson” within lesson and feedback views. Open Fin with a visible lesson-context chip and an editable suggested question. Never auto-send or overwrite an existing draft. Provide a return-to-lesson action and a way to clear the context.

Send only a module identifier and content version as context selectors. The backend validates that the module is published and loads reviewed teaching material; the client cannot inject system instructions. Do not pass private answer keys or undisclosed quiz answers to the tutor. Fin explains concepts and asks guiding questions; it does not mark modules complete.

Reuse the current authenticated API, AI consent, quotas, response presentation and AI guidance notice. Preserve Fin's existing requirement for a saved-record lookup before every finance answer, including education; a successful empty lookup can still support general teaching. Teaching content is not evidence of the user's actual finances. Update the Privacy & data explanation to disclose the reviewed lesson context sent with a tutoring request. Fin failure or disabled consent must not prevent reading, quizzes, feedback, practice or missions.

## Data and implementation boundaries

Reuse learning paths/modules, source links, weekly goals, quiz history and mission assignments. Add only the state needed for question versions and active attempts, module-linked practice evidence, optional focus and mission selection reasons. All learner records remain owner-scoped with account-deletion cascades. Server operations must derive the user identity from authentication and use restricted privileges and search paths.

Primary integration points: `types/learning.ts`, `utils/learning-action.ts`, `app/learning-path-details.tsx`, `app/(tabs)/edufinance.tsx`, `components/weekly-money-mission-card.tsx`, `app/(tabs)/chatbot.tsx`, `app/privacy.tsx`, `chatbot-backend/lib/fin-chat.js`, the Learn guided-tour copy and new additive database migrations. Update relevant documentation and test fixtures. No new dependency is expected.

This scope does not add bank verification, automatic transfers, debt payment execution, leaderboards, certificates, a course marketplace or an offline content cache. “Works without AI” still requires the existing connection to load and save learning data.

## Verification and release criteria

- Regression tests reject unrelated goals, another user's evidence, invalid amounts and wrong periods; cancelled navigation never completes an exercise.
- Actual migration tests exercise attempt scoring, private answer storage, stale/replayed submissions, owner isolation, direct-write restrictions, stable/adaptive mission assignment and preservation of historical rows.
- Fin handler tests cover invalid lesson identifiers, unpublished content, prompt-injection text, consent failures and preservation of existing personal-finance safeguards.
- UI checks cover new/returning learners, AI disabled, failure/retry, all paths finished, no debt, loading/save errors, long content, text scaling, keyboard behaviour and accessible labels. Run app tests, database tests, backend tests, lint, type checking and a web export.
- Native-device and authenticated end-to-end checks must be reported separately from unit tests and web previews. A prototype or passing unit test is not evidence of better real-world financial behaviour.
- Deploy the compatible database/backend changes before relying on new app calls. Keep a recoverable release path; do not drop historical learning records. Confirm hosted versions and account access before deployment.

## Proposed defaults for confirmation

Use the first-job beginner framing, optional focus selection, two reviewed question sets per topic, preserved legacy progress and optional lesson-aware Fin support described above. These defaults keep the improvement achievable within the existing product while making its limitations visible.
