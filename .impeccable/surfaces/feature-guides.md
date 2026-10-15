# Learn, Fin and Tax Relief guides

Mode: Operate. Targets: Learn (`app/(tabs)/edufinance.tsx`), Fin (`app/(tabs)/chatbot.tsx`), Tax Relief (`app/lhdn.tsx`).

The user asked to extend the approved Home tour to these three sections on 15 October 2026. Preserve the established Poppins 400/700, mint/teal/offwhite palette, flat invitation and three-step spotlight panel.

- Offer an optional inline invitation on first section visit. Remember skip, completion and unfinished position separately for each user and section on this device.
- Keep a 48-unit help button in each section header for replay. Reuse the Home tour's panel, keyboard/native dismissal and small-screen fallback.
- Learn explains Foundation paths, Weekly money mission and Personal money goals. Its actions reveal existing sections. The guide never completes lessons, missions or goals.
- Fin explains specific questions, follow-ups and checking important details. Example actions prepare the message box, preserve existing drafts and require the user to press Send.
- Tax Relief explains assessment year/filing setup, manual/receipt evidence and Claims/Breakdown review. Preserve the selected year and existing draft/eligibility behavior. Tour actions do not save, confirm or submit claims.
- Failed preference storage keeps the main app usable, suppresses automatic repeated invitations and reports session-only progress for manual use.

Verification must distinguish real component/hook fixtures from authenticated/native-device testing. Remove temporary preview routes. No new brand primitives or generated imagery are required.

## Implemented behavior

`components/feature-guide.tsx` supplies the three invitations, explanations and header help controls. `hooks/use-feature-guide.ts` resolves the signed-in user, and `utils/feature-guide-core.ts` stores section-specific guide status and step. Guide completion records walkthrough progress rather than financial or learning milestones. A storage failure leaves manual replay usable with a session-only notice inside the open modal and independently on the page, where it remains after Skip or Finish.

`hooks/use-guide-targets.ts` measures native views and scrolls Learn and Tax Relief to their existing controls. Learn actions reveal Foundation paths, Weekly money mission and Personal money goals. Fin's `prepareFinGuideQuestion` preserves an unsent draft, fills a blank draft with the first two examples and adds no example for the final own-question action; its route focuses the composer without sending. Tax Relief opens `/tax-filing` with the selected assessment year, reveals Add claim/Scan receipt/Choose photo or selects Breakdown. These guide callbacks do not save, confirm or submit financial data. Learn and Tax Relief suppress invitations and tours during page loading/errors; replay also respects their existing busy/editor states.

The shared `GuidedTour` in `components/home-guide.tsx` keeps the approved Home styling and actions. Its scrollable panel is capped at 420 native units, inset by 16 from safe-area bounds, and uses a centered explanation when available height is below 540, font scale exceeds 1.4 or spotlight placement cannot fit. Poppins Regular/Bold, mint actions, offwhite panels and outline icons remain surface applications of the incumbent system. No visual-system change, new assets or HTML-based native target detection was introduced.

## Verification and limits

The final verification run passed 58 automated tests, TypeScript checking and scoped lint. `.impeccable/review/feature-guides/checks.json` records 37 passing Expo Web UI checks covering guide navigation, per-user/per-section preferences, reload, draft preservation, session-only warnings, compact/landscape controls and the Home wrapper's retained callbacks. Nine JPG captures in that directory cover phone, compact, tablet and landscape views. A source-and-capture finish review returned SHIP within that scope.

The temporary fixture exercised the real guide components and hook with injected identity and sample section controls, then was removed. Screenshots are component/hook fixtures, not authenticated Learn, Fin or Tax Relief pages. Callback checks and source inspection do not verify live lesson/goal changes, chat responses, filing persistence or receipt/claim services. Native iOS/Android layout, text scaling, assistive technology, keyboard/back dismissal and authenticated end-to-end flows still require device/session verification. Existing route colors and typography outside the guide remain outside this extension's audit; they are not new approved tokens.
