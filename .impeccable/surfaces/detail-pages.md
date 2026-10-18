# SafeSpend detail pages

Mode: Operate. Platform: adaptive Expo/React Native.

The user approved applying this design to all seven default-header screens: Monthly Budget, Accounts, Add/Edit Account, Record Transfer, Stored Receipt, Transaction Details and Money Skills. The purpose is recognizable back navigation and a stronger SafeSpend identity, preserving each task and its existing data operations.

## Design

Keep the native stack for safe-area/header layout, modal presentations and system navigation. Replace its stock back control with one shared bare mint arrow on deep teal, with no colored button fill, Poppins Bold header titles, 48-wide target, 44-high on iOS and 48-high elsewhere. Press feedback changes opacity without adding a background. Return through existing navigation history; direct entry falls back to Accounts for account forms/transfers, Learn for learning details, or Home for the remaining pages. No custom gesture interception is added.

A pale-green #F1F8F3 canvas frames bounded 780-wide content. Teal carries the budget/account/learning summaries and primary actions; offwhite panels carry forms and longer reading. Muted copy uses #294B47. The user explicitly replaced the initial bright-mint canvas and filled back control with this quieter treatment, retaining the dark header. The mint arrow on teal has 5.92:1 contrast. The existing semantic error/warning colors and all financial validation/persistence remain in place. No decorative imagery, new dependency or motion was added.

## Verification

- Two back-navigation regressions: ordinary stack return and usable direct-entry fallback. The direct-entry test failed with unconditional back, then both passed with history-aware routing.
- Browser UI verified direct Add Account → Accounts fallback and Accounts → Transfer → Accounts stack return without saving anything.
- Actual screens inspected at 390×844 and 1024×900 in Expo Web: one back control per screen, bounded wider layout, no document horizontal overflow. Back controls measured 48×48 in the web preview. The initial edge spacing was corrected in one final batch. A follow-up on budget field bounds caught the browser's intrinsic 200-wide input extending past its 112-wide field; `minWidth: 0` lets the flex input fit its container. The compiled preview confirmed all 11 inputs within their field bounds at phone width (about 82 wide after the currency prefix). This was a sizing defect, not further visual polishing.
- The preview browser was signed out. Budget/Accounts showed their existing load-error/empty states; receipt/transaction used nonexistent fixture IDs and showed unavailable states; learning showed its unavailable state. Add Account and the empty Transfer form were inspected. Populated account editing, receipt/transaction details and lesson/quiz/practice states were reviewed in code, not verified signed in during this styling pass. No records or AI preferences were changed by these checks.
- Final checks: 154 app tests, TypeScript, Expo lint and Expo Web export passed. No database/backend changes, deployment, Git commit/push or mobile binary release.
- Pale-background revision: TypeScript, Expo lint and a fresh Web export passed. The compiled Add Account preview at 390×844 confirmed the pale canvas and unchanged dark header; the back control measured 48×48 with a transparent background. This revision only changes presentation; the app suite was not repeated for these color changes.

The user reports that the preceding learning release works well on a physical device. This styling/navigation update still needs native-device verification, including swipe/hardware Back, modal insets, keyboard/IME, larger system text and screen-reader behavior. Browser dimensions do not establish those results.
