# SafeSpend competition validation protocol

This is a plan to collect evidence, not a report of completed testing. No pilot participants, measured benefits or commercial results exist yet. Keep raw observations and report failures as well as successes.

## Reliability gate

Run the rollout checks in `audit-remediation.md` in a separate test project with two disposable accounts. Demonstrate capture → review → confirm spending → reuse receipt in Tax Relief → review eligibility. Confirm one purchase stays one intended expense. Reconcile Home, chart center, Budgets and Accounts with known expenses/refunds, including the RM80 expense / RM100 refund / RM120 other expense example (net RM100). Explain unassigned accounts and chart category shares.

Try offline/slow network, denied camera permission, invalid session, quota exhaustion, unsupported currency, non-receipt images, cancelled learning actions and failed cleanup. Record the device/build/backend/migration versions, expected outcome, actual outcome and evidence for each test. A local unit pass does not substitute for this gate.

## Receipt and Fin evaluation

Prepare consented or synthetic MYR receipts spanning clear/faded print, Malay/English text, discounts/SST, ambiguous dates and duplicate photos. Include foreign currency and non-receipt negatives. Have a person establish the ground-truth merchant, date, total, currency and items before scanning. Preserve failures and rejected images in the denominator.

Report the number tested, exact-field accuracy separately for each field, rejection behavior, correction count and time to a correctly confirmed expense. Do not call model confidence calibrated unless you have measured calibration. Test actual paid generation only after choosing a dataset, permissions and a spend limit.

For Fin, create a known-answer ledger and ask equivalent English/Malay questions about spending, refunds, receipt dates, no matches and limited history. Test unrelated questions and requests outside its tax/learning scope. Record lookup use, factual correctness and appropriate refusal separately; a successful tool call alone is not an accurate answer.

## Small user study

Start with one clearly defined first user group, such as first-time salaried Malaysian taxpayers who already record spending manually. A small convenience sample can uncover usability problems; it cannot establish population-wide demand.

Ask participants to complete the same receipt-to-reviewed-expense and saved-evidence-to-tax-review tasks in SafeSpend and their current method. Alternate task order where practical and use equivalent records. Obtain consent before observing or retaining data; use synthetic records when real financial information is unnecessary. Explain AI processing before enabling it.

Record completion without help, elapsed time, corrections, repeated purchases, misinterpretations, points where help was needed and the participant's own words about usefulness. Record every intervention. Report individual results and median/range, sample size, recruitment method and study limitations. Ask what they currently use, what problem repeats, and what would make them return. An intention to use/pay is not retention or revenue.

## Competition claims and materials

Describe SafeSpend as an integrated prototype until observed outcomes justify stronger wording. Do not claim first-of-its-kind, automatic LHDN approval, complete tax filing, universal biometrics, bank-synced balances, measured savings or a percentage improvement without supporting evidence.

Prepare the guidebook's synopsis, technical drawing and printed A1 poster using its supplied template. Show the actual architecture and a short reliable demo, supported tax scope, field-test results, failure handling, current limitations and maintenance owner. Confirm team eligibility, exhibit requirements and event dates with the organizer. Keep a consented offline demonstration recording as a fallback and label it as recorded.
