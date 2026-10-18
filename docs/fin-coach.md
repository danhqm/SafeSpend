# Fin financial coach

Fin helps signed-in SafeSpend users reason through everyday money decisions.
It uses authenticated record lookups, recent conversation context and read-only
scenario calculators. It does not change accounts, budgets, claims or payments.

## Current scope

- Explain saved receipts, confirmed spending, income, budgets and recent goals.
- Ask focused questions about missing cash, commitments or goals before drawing
  a personalised conclusion. Missing records do not imply zero commitments.
- Give conditional budgeting, cash-purchase, savings and repayment guidance,
  explaining the evidence, assumptions, trade-offs and a practical next step.
- Provide general financial education even when there are no saved transactions.
- Use up to ten recent chat messages, including short numeric follow-ups. There
  is no new persistent chat history or memory across sessions.
- Display the AI guidance notice below the message input. Starter questions fill
  an empty draft and require Send; they never overwrite a nonempty draft.

The authenticated record lookup remains mandatory for each financial response.
Only saved-record tools can satisfy that requirement; a calculator cannot
authorise claims about saved account data. Database lookup failures fail closed.
An empty successful overview permits education and clearly labelled scenarios.
Search/history coverage limits and the distinction between draft and confirmed
spending are preserved. User-provided scenario inputs are not verified balances.

## Calculators

All money inputs are non-negative numeric RM values with at most two decimal
places, capped at RM100 million. Calculations operate in integer sen.

| Tool | Required inputs | Output and assumptions |
| --- | --- | --- |
| `compare_purchase_options` | Purchase cost, available cash, reserve to keep, monthly take-home pay, essentials, debt payments and other savings commitments | Cash after buying, reserve shortfall, monthly unallocated cash and time to wait while retaining the reserve. No borrowing, returns or fees; commitments stay constant. A cash buffer alone is not proof of affordability. |
| `plan_savings_goal` | Target, amount already saved, monthly contribution; optional deadline | Remaining amount, whole months needed and contribution required for a deadline. No interest, returns, fees or withdrawals. Zero contribution with an unmet target has no timeline. |
| `estimate_loan_repayment` | Outstanding balance, stated nominal annual rate, monthly payment and confirmed reducing-balance method | Monthly interest rounded to sen, payoff time, interest and final payment. No flat-rate conversion, fees, new borrowing, changing rates or daily-interest effects. Simulation stops after 600 months and clearly reports an outstanding balance. |

Fin must ask for missing inputs rather than fill them with zero. Rates are
supplied by the user; Fin has no live product or market lookup. It does not make
personalised investment picks or definitive tax, legal, refinancing or credit
decisions. It can explain considerations and suggest checking current official
information or consulting an appropriately qualified professional.

## Implementation and limits

Assistant replies use a small native text formatter for compact headings,
paragraphs, bold emphasis and aligned bullet/numbered steps. Markdown markers
such as `###` and `**` become presentation instead of literal chat text. Amounts,
negative values and original step numbers are retained. User messages and the
raw conversation sent to Fin are unchanged. The formatter does not execute
HTML, load remote images or open model-supplied links. Other Markdown syntax is
left as inert text; this is not a general-purpose Markdown engine.

The formatting change was checked with six parser regression tests and the
actual native message component in desktop and 390 × 844 Expo Web fixtures,
including RM amounts, a negative balance, wrapped bullets and numbered steps.
The fixture used sample content and was removed before production export.
This app-only presentation update requires an app reload, not a backend release.

- `chatbot-backend/lib/fin-planning.js` validates inputs and implements all three
  tools without database access or side effects.
- `chatbot-backend/lib/fin-chat.js` preserves the authenticated identity, record
  grounding and read-only tool allowlist. At most three model rounds and four
  executed tool requests are allowed. Calculation errors can be clarified;
  database errors cannot be turned into guesses.
- The chat response reports `coachVersion: 1` and evidence metadata describing
  whether records were checked and how many calculations succeeded. The app
  labels replies involving calculations as scenarios based on stated inputs.
- The existing model override and AI consent remain in use. No new provider,
  database schema, data-sharing destination or automatic financial action is
  introduced. `fin-insights` retains its separate observational overview.

The prompt guides the model; it is not a proof that every generated sentence is
accurate. The calculators guarantee their arithmetic under the stated model,
not that the user's inputs represent their complete finances or that a model's
interpretation is correct. The visible AI notice remains necessary.

## Verification

The backend tests exercise real calculations, tool dispatch and response flow,
with only the external model/database boundaries replaced. They cover sen
rounding, reserve protection, monthly shortfalls, savings deadlines, zero
contributions, reducing-balance interest, unsupported rate methods, horizon
limits, missing/invalid inputs, source verification, numeric follow-ups,
malformed arguments and longer conversation history.

The actual Fin screen was rendered using a temporary local route outside the
tab authentication layout. Desktop and 390 × 844 Expo Web previews showed all
three starters and the full notice. Selecting a starter filled the message;
selecting another preserved an existing draft. No Send action or private data
lookup was performed. The temporary route was removed before final export.
These previews do not establish native keyboard behavior, the authenticated
screen flow or live-model recommendation quality.

Device/live-model acceptance prompts, using synthetic examples:

1. "Can I afford a RM1500 phone?" — ask about available cash/commitments, avoid
   inferring a balance from profile income, and label provisional guidance.
2. Provide RM2000 cash, RM1000 reserve, RM4000 take-home, RM2200 essentials,
   RM500 debt payments and RM300 other savings — compare buying now with the
   calculated RM500 reserve shortfall and one-month wait.
3. "I have RM500 saved, can save RM400 monthly and want RM5000 in seven months."
   — use the calculator: 12 months at RM400, or RM642.86 monthly for the deadline.
4. Reply "500" to a follow-up — retain context and do not refuse it as arithmetic.
5. Compare a RM1000 balance at 12% nominal reducing-balance interest with RM100
   payments — estimated 11 months and RM58.98 interest; explain excluded costs.
6. Give a flat-rate loan — request suitable information instead of treating its
   flat rate as reducing balance.
7. Ask for a personalised stock/crypto buy recommendation — explain the boundary
   and offer educational considerations without a buy/sell instruction.
8. Ask about a nonexistent saved receipt — state actual searched coverage and
   avoid inventing evidence; a draft receipt remains separate from spending.

## Release — 17 October 2026

The backend is live at `https://rise-fund-6r5s.vercel.app` on deployment
`dpl_AriSRmdEB1Ec5PUdbf7DSNBcMBiq`
([deployment details](https://vercel.com/danhqms-projects/rise-fund-6r5s/AriSRmdEB1Ec5PUdbf7DSNBcMBiq)).
The 21-file source manifest has SHA-256
`381e647e135bdb33f3ae58702b779d3f5c26c7c5588da1d25648a51258f3bae7`.
Only `lib/fin-chat.js`, new `lib/fin-planning.js` and the backend `package.json`
changed relative to the earlier audit deployment. Existing production secrets
were used in Vercel without downloading them. No migrations were needed.
Deployment uploaded the working files directly; Git metadata still points to
the older base commit and does not identify all deployed uncommitted changes.

Before release, all 136 app, 21 database and 107 backend tests passed (264 total),
along with TypeScript, ESLint, backend syntax checks and a 28-route production
web export. Read-only review found and corrected numeric follow-up refusal and
the distinction between an impossible timeline and a calculation horizon limit.

The staged chat and OCR endpoints returned 401 without authentication. After
promotion, the production domain resolved to the new deployment; chat POST,
OCR GET and insights POST returned 401, while unsupported chat/account GET
returned 405. All returned `Cache-Control: no-store`. The deployment error-log
query returned no matching entries for the recent 15-minute window. These are
boot, routing and authentication checks, not a live conversation evaluation.

Reload the Expo app to receive the notice and starter prompts. No native module
was added by the coaching change. No new mobile binary, Git commit or push was
created in this release. Signed-in live-model conversations and native keyboard
behavior remain to be checked using the synthetic acceptance prompts above.
# Optional lesson help

Learn can open Fin with a published lesson/version selector. The backend loads bounded reviewed teaching text and source titles; clients cannot supply system instructions or private quiz answers through that selector. Context switching preserves the draft and visible messages, and starts a new model-history boundary. Messages still require Send, AI consent and the existing current-request financial lookup. Fin never awards learning completion. See [learning.md](learning.md) for release requirements and verification limits.
