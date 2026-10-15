# Profile

Route: `app/(tabs)/profile.tsx`
Mode: Operate
Scope: Approved profile redesign inside the established SafeSpend identity.
Approval: The user selected "Implement this design" on 15 October 2026.
Approved visual reference: `.impeccable/mocks/profile-approved.png` (sample identity details; device framing is presentation, not application UI).

## THESIS

Make profile a personal and useful account hub while preserving every current action.

## OWN-WORLD

Poppins 400/700, deep teal #0E3E3E, mint #00D09E, offwhite #F1FFF3, field #DFF7E2, ink #093030, muted green-gray #617470, pale teal #A9C9BE, separators #C9DAD4 and logout red #B42318. Flat tonal surfaces and native settings rows; no invented financial statistics or decorative assets.

## STORY

Identify the signed-in user, change their photo or edit details, access Accounts or LHDN Tax Relief, control supported-device Face ID and log out. Keep the current five-tab dock outside this page's component.

## FIRST VIEWPORT

Deep-teal title and identity area, left-aligned avatar/name/email/member ID, upper-right Edit action. A rounded offwhite sheet contains Money tools, conditional Device security and a separated Log out action. Content remains scrollable and clear of the floating tab dock.

## FORM

The user-pinned mockup fixes the composition: a horizontal identity group, large 40px sheet corners, bordered native rows and a native switch. Phone-first layout; on tablets a bounded content column uses the same hierarchy. Insets, larger text, accessible labels, error/loading/busy states and keyboard focus take precedence over the illustrative phone frame. No entry choreography; native press and switch feedback convey state.

## Product constraints

- Existing edit, account and tax routes remain unchanged.
- Photo picker and persistence stay in the existing profile workflow.
- Face ID stays conditional on supported hardware and enrolled credentials.
- Logout retains sign-out and per-user Home-cache cleanup.
- Preview data must be marked synthetic; no demo route or hard-coded identity ships.

## Verification limits

Record actual device and preview coverage at completion. A browser preview is not native emulator evidence.
