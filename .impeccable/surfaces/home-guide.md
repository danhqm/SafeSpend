# Home getting-started guide

Mode: Operate. Primary target: `app/(tabs)/index.tsx`.
Related: `components/home-guide.tsx`, `hooks/use-home-guide.ts`, Profile guide entry.

The user approved implementing the discussed optional welcome, three focused moments and action-based checklist on 15 October 2026. This extends the existing Home flow and SafeSpend identity.

## Direction

Poppins 400/700, mint actions, deep teal text, offwhite tour panel and field-green inline welcome/checklist. Flat, compact and calm; outline Ionicons match neighboring screens. No illustration, entrance choreography or new product statistics.

## Behavior

- A new empty account receives an inline invitation with Show me around and Maybe later. Existing activity or an overall budget suppresses the automatic welcome.
- Three optional explanations highlight Scan Receipt, Total Expense and Monthly Budget. Each can be skipped; the first offers scanning or manual entry. Navigation uses the existing real screens.
- Completed walkthrough explanations and real setup milestones are separate. Posted expenses, the explicit overview acknowledgment, and saved overall budgets complete checklist items. Draft scans and Next clicks do not complete financial tasks.
- Per-user preferences and booleans persist on the current device. No financial amounts or new server schema. Unavailable history never means an empty account. Storage/network failures leave the main app usable.
- Profile provides a replay entry, preserving completed milestones. Unfinished walkthrough position is resumable from Home; dismissal is respected.
- Targets are measured from actual native views. Small/landscape screens and larger text use a scrollable centered panel with explicit control-location copy when a spotlight cannot fit.

## Verification scope

Cover persistence, user isolation, true milestones, optional dismissal/replay, forward/back/skip, real navigation callbacks, keyboard escape/focus and phone/tablet layouts. Label fixture data; remove temporary preview routes. Expo Web renders do not establish native-device evidence.

## Implemented surface

- `HomeGuideCard` supplies the inline invitation and three-row checklist. Its field-green card is flat, with a 16-unit radius and 20-unit padding. `HomeGuideTour` uses an offwhite panel capped at 420 units, with a 20-unit radius and 24-unit padding. These are local component choices, not additions to the global token scale.
- Guide headings use Poppins Bold at 20/29 and 24/33; tour body copy uses Poppins Regular at 14/24. Mint primary actions, dark-mint secondary actions and deep-teal text reuse the incumbent palette. Buttons have a 48-unit minimum height; checklist rows have a 76-unit minimum height. Outline Ionicons, separators, press opacity and keyboard focus continue existing native patterns.
- Home measures Scan Receipt, Total Expense and Monthly Budget with `measureInWindow`, remeasuring on step, size and font-scale changes. The panel scrolls; short viewports, larger text or insufficient space use the centered fallback with explicit location copy. The tour has no entrance animation.
- Scan, manual-entry and budget actions route to `/receiptscanner`, `/add-transaction` and `/budgets`. Profile's Getting started group uses the existing `ActionRow` for SafeSpend guide and reopens the tour at step one without clearing milestones.
- The expense milestone requires a positive posted expense; the budget milestone requires a positive saved `ALL` budget. Got it, next on the overview step records its acknowledgment. Financial milestones remain complete after replay. Guide state is versioned and keyed by user, using native secure storage or browser local storage; it contains preferences and booleans rather than financial values.
- The implementation remains within the approved SafeSpend identity. `DESIGN.md` and `.impeccable/design.json` are preserved; no new visual world or produced assets were introduced.

## Verification record

The implementation session reported 51 passing tests, TypeScript checking and scoped lint. `.impeccable/review/home-guide/checks.json` records 19 passing Expo Web component-preview checks covering invitation/dismissal, reload persistence, replay, forward/back navigation, milestone separation, forwarded task callbacks, Escape, keyboard focus, compact layouts, tablet bounds and landscape fallback.

Eight labelled fixture captures in `.impeccable/review/home-guide/` cover phone welcome, all three tour steps, completed checklist, compact budget, tablet expense and landscape expense states. Their sample Home data and preview controls are verification fixtures. The temporary `app/guide-preview.tsx` route has been removed.

No connected native device was available. These checks and captures do not establish authenticated full-Home navigation, live account reconciliation, native spotlight coordinates, native screen-reader behavior or on-device persistence. Those remain unverified. The source comparison and fixture captures support an ordinary component extension; they do not establish an application-wide design migration.
