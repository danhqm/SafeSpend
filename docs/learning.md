# Learn: implementation and verification

SafeSpend's three foundation paths follow Learn → Decide → Apply. The dashboard recommends an unfinished step or a recent unresolved check, with an optional spending/saving/debt focus. Other paths stay available. Examples are intended for Malaysian first-job earners and are hypothetical; no user outcome study has been performed.

## Checks and evidence

Quizzes use two reviewed sets of three questions per topic. Two correct answers pass. The server saves an active attempt and option order, keeps answer keys in a private schema, and scores against that saved version. Replaying the same submission returns the same score; retries select a different set when available. A lost submission response freezes the attempted answers while the client retrieves the owned session's stored result; a recovered result restores the originally submitted choices. The interface discloses repeats after the small bank has been used. Explanations link back to the relevant lesson point; later failed practice does not erase a pass.

The additional scenarios cover the existing cash-flow, flexible-budget, emergency-buffer and debt-cost competencies. They reuse the existing module/source links and their limitations. Cash-flow examples were checked arithmetically; the content does not introduce product recommendations, statutory rates or a universal budget ratio. This is an internal content review, not an external expert endorsement. Source review dates remain attached to the original research, not silently refreshed.

Practice is module-specific and checked on the server. Budget practice explicitly links an owned, positive MYR budget for the current Malaysian month. Savings saves a target, contribution frequency/amount and first step. Debt saves a priority, strategy and reason, with a clearly labelled hypothetical option. Partial drafts persist across navigation/restarts. Generic weekly goals and their checkboxes cannot award module completion.

Progress distinguishes lesson viewed, quiz passed, plan saved and legacy practice. Historical goals, attempts and progress survive the migrations. An earlier action completion is not retroactively verified. Saving a plan is not proof that money moved. Weekly missions remain self-reported.

## Recommendations and tutoring

Weekly assignments use Malaysian Mondays and stay stable during the week. Selection prioritises an unresolved failed-check topic, then chosen focus, next unfinished path, and least recently used eligible mission. The assignment records and displays its reason. A quiz mistake does not establish a real debt or spending problem.

Lesson-aware Fin is optional. Opening help fills only an empty draft and never sends. Switching contexts needs an explicit decision; earlier chat remains visible while the model-history boundary resets. The backend validates a published lesson/version and supplies only teaching fields and source titles. It never loads private quiz keys for tutoring. Existing AI consent, quotas and personal-finance evidence safeguards apply. Core learning works with AI off, but still needs a network connection to load/save.

## Release sequence

Apply these additive migrations in order before using the new app calls:

1. `20261018052258_learning_quiz_sessions.sql`
2. `20261018052308_learning_practice.sql`
3. `20261018052619_learning_missions_and_content.sql`

Deploy the backend including `lib/fin-learning.js`, then release the compatible app. The old quiz RPC explicitly requests an app update instead of scoring against the new question format. Do not roll back to an old app while expecting old quizzes to work; preserve the new data and ship a compatible forward fix. No historical learning data is dropped.

The three migrations and compatible backend were deployed on 18 October 2026. Hosted SQL/anonymous HTTP checks and signed-in Web testing are recorded in [the release report](deployment-learning-2026-10-18.md). The compatible client is in this checkout; no mobile binary was published. Local migration tests use actual PostgreSQL policies/functions through PGlite; separate hosted checks exercised Supabase services, but not concurrent production database connections.

## Verification record

Final local checks on 18 October 2026: **152 app tests, 59 database tests and 118 backend tests passed**. Type checking, Expo lint, backend syntax checking and Expo Web export passed. Independent review identified five material issues; regression tests first reproduced them, then passed after the fixes: lost quiz response recovery, entering lesson context from an existing chat, in-flight context changes, retention of confirmed evidence during draft edits, and relevant feedback slide mappings. Hosted UI testing also prompted a regression fix excluding archived modules from the earlier-practice count and a visible draft-save notice.

The actual reusable practice fields were exercised in a temporary Expo Web component fixture at 390×844 and 1024×900. Sample savings, hypothetical debt and explicit budget selection validated successfully without database writes. Selected radio semantics were checked in the rendered accessibility/DOM state; the tablet layout had no document overflow. The fixture route was deleted before the final export.

Later signed-in testing verified focus/recommendation changes, stable missions, quiz reload/scoring/feedback/retry, partial-draft validation/save/recovery, Fin handoff and consent denial. One approved live Fin lesson question succeeded through a temporary loopback test proxy because production CORS excludes the localhost test origin; AI was restored off. See the release report for the intentional learning test records and transport limitation. Physical keyboard/IME, large system text, screen readers and real parallel database connections were not verified. One model example does not establish advice quality across cases or better real-world financial behaviour.
