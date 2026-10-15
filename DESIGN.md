---
name: SafeSpend
description: Calm and trustworthy money management, expressed through Poppins, mint and deep teal.
colors:
  mint: "#00D09E"
  deep-teal: "#0E3E3E"
  offwhite: "#F1FFF3"
  field: "#DFF7E2"
  ink: "#093030"
  muted: "#617470"
  border: "#C9DAD4"
  pale-teal: "#A9C9BE"
  dark-mint: "#087D65"
  white: "#FFFFFF"
  danger: "#B42318"
typography:
  onboarding-headline:
    fontFamily: Poppins_700Bold
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.8px"
  profile-title:
    fontFamily: Poppins_700Bold
    fontSize: "32px"
    fontWeight: 700
    lineHeight: 1.375
    letterSpacing: "-0.8px"
  identity:
    fontFamily: Poppins_700Bold
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.384615
    letterSpacing: "-0.6px"
  section-title:
    fontFamily: Poppins_700Bold
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.5
    letterSpacing: "-0.4px"
  action-title:
    fontFamily: Poppins_700Bold
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.5
  onboarding-body:
    fontFamily: Poppins_400Regular
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.75
  supporting:
    fontFamily: Poppins_400Regular
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.615385
  identity-detail:
    fontFamily: Poppins_400Regular
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.692308
  member-label:
    fontFamily: Poppins_400Regular
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.666667
rounded:
  receipt-paper: "8px"
  action: "12px"
  primary: "28px"
  dock: "30px"
  receipt-stage: "32px"
  sheet-top: "40px"
spacing:
  small: "8px"
  row-gap: "14px"
  standard: "16px"
  content: "24px"
  sheet-top: "28px"
  hero-bottom: "32px"
components:
  onboarding-primary:
    backgroundColor: "{colors.mint}"
    textColor: "{colors.deep-teal}"
    rounded: "{rounded.primary}"
    padding: "14px 20px"
  profile-edit:
    textColor: "{colors.mint}"
    rounded: "{rounded.action}"
  profile-icon-tile:
    backgroundColor: "{colors.field}"
    textColor: "{colors.deep-teal}"
    rounded: "{rounded.action}"
    size: "44px"
  profile-action:
    textColor: "{colors.deep-teal}"
    typography: "{typography.action-title}"
    rounded: "{rounded.action}"
    padding: "14px 0"
  profile-sheet:
    backgroundColor: "{colors.offwhite}"
    padding: "28px 24px"
  receipt-paper:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.receipt-paper}"
    width: "225px"
    padding: "18px 20px 13px"
  tab-dock:
    backgroundColor: "{colors.deep-teal}"
    textColor: "{colors.pale-teal}"
    rounded: "{rounded.dock}"
    height: "78px"
---

# Design System: SafeSpend

## Overview

SafeSpend's confirmed brand is calm and trustworthy. Poppins, mint and deep teal connect the approved Mint Welcome and Receipt Focus onboarding to the approved Profile implementation. Flat tonal surfaces, clear type and familiar native controls make account actions easy to recognize.

This is a source record for those approved surfaces, not evidence of a completed application-wide migration. The Profile approval extends the existing identity; its composition is scoped to `.impeccable/surfaces/profile.md`. No new creative metaphor or replacement identity has been selected.

**Key Characteristics:**
- Poppins Regular and Bold, with readable supporting text.
- Mint actions, deep-teal structure and soft offwhite surfaces.
- Rounded sheets and simple outline iconography.
- Native text scaling, safe areas and scrollable content.
- Honest identity, loading and device capability states.

Evidence: `app/onboarding.tsx`, `components/onboarding-receipt.tsx`, `components/profile-overview.tsx`, `app/(tabs)/profile.tsx` and the font loader in `app/_layout.tsx`. The existing shell is recorded from `components/safe-spend-tab-bar.tsx` and `app/(tabs)/_layout.tsx`. `.impeccable/mocks/profile-approved.png` records the user's chosen surface; phone framing and sample identity details are presentation material. The files under `.impeccable/review/profile/` are Expo Web previews, not native device verification.

## Colors

The frontmatter owns the confirmed values. These colors are extracted from React Native source; they are not a centralized runtime theme.

### Primary
- **Mint:** onboarding background and primary action, profile Edit/retry/photo badge, enabled switch and active navigation accents.
- **Deep teal:** profile identity area, onboarding headings, native settings icons and the existing tab dock.
- **Dark mint:** onboarding progress/scanner detail, profile busy indicators and keyboard focus on light surfaces. It is an observed functional tone, not a generated color ramp.

### Neutral
- **Offwhite:** onboarding canvas and the profile content sheet.
- **Field green:** onboarding artwork backdrop, profile icon tiles and row press feedback.
- **Ink:** illustrative receipt text.
- **Muted green-gray:** supporting copy and row chevrons on light surfaces.
- **Border:** profile separators, receipt rules and inactive Face ID switch track.
- **Pale teal:** secondary identity text on deep teal and idle dock icons/labels.
- **White:** illustrative receipt paper and native switch thumb.
- **Danger red:** the profile Log out label and icon.

Profile's danger tile tint (`#FCECE8`) and loading skeleton (`#315C58`) are local state treatments, not new brand primitives. The existing dock also has its own border treatment. No synthesized tonal ramps are production tokens.

## Typography

The app loads `Poppins_400Regular` and `Poppins_700Bold`. Use those actual native font family names. There is no confirmed medium-weight font in the root loader.

The frontmatter records default source roles. Native dimensions are density-independent units; `px` is used only for portable DESIGN.md serialization. Profile title, identity and section headings use tight negative tracking. Onboarding uses a default headline of 30/39, a 32/41 Receipt Focus variant and a 28/36 compact variant. Supporting profile descriptions use 13/21; email uses 13/22 and member ID 12/20. The primary onboarding label is Bold at 16; Edit is Bold at 14/22. These surface differences do not establish a universal type scale for every route.

Text scales with the user's native font setting. The bounded avatar initials and illustrative receipt artwork use fixed text sizing; the receipt exposes an accessible example description. Member IDs and receipt amounts use tabular numerals. Keep identity details able to wrap rather than truncating them to fit a mockup.

## Layout

Profile uses a vertically scrollable, full-width column capped at 640, centered on wider screens. Hero and sheet have 24-unit horizontal padding. The hero has 18 top and 32 bottom padding; the sheet begins with 28 top padding. The title/Edit row sits above a horizontal avatar/identity group with an 18-unit gap and 26-unit top margin.

The identity group stacks when `width < 350 && fontScale > 1.2`, or whenever `fontScale > 1.5`. The sheet's bottom padding is `max(bottomSafeArea, 16) + 100`, keeping its actions clear of the existing floating dock. The safe-area container covers top and side insets; bottom clearance is computed within the sheet.

Onboarding caps its content column at 460. It uses 28 horizontal padding, reduced to 22 below a 350-unit content width. An available height below 760 selects compact artwork and spacing. Each page can scroll vertically when text or content grows; horizontal paging retains the current page across size changes.

Interactive targets on the approved screens are at least 48 in the relevant touch dimension. Profile action rows have minimum height 76; the security row has minimum height 80. Larger text must be allowed to grow these rows.

## Elevation & Depth

Profile is flat: no hero, sheet or settings-row shadows. Deep teal, offwhite, field tint and one-unit separators convey hierarchy. Receipt Focus's illustrative paper alone uses `0 8px 22px rgba(4, 42, 38, 0.14)` and a small rotation to read as a physical receipt. This artwork treatment is not a default settings-card elevation.

The unchanged floating dock has `0 8px 22px rgba(4, 42, 38, 0.26)`; its raised scan control has `0 4px 12px rgba(0, 208, 158, 0.35)`. Those existing shell treatments are not a reason to add shadows to Profile.

## Shapes

The approved onboarding sheet and Profile sheet share rounded top corners (40). This is a native, user-approved shape; the Profile sheet has square lower corners. Onboarding's primary button is rounded (28). Profile icon tiles are square (44) with softly rounded corners (12); its action rows and keyboard focus targets also use the action radius. The profile avatar is circular (80 inside an 88 target), with a circular mint camera badge (32). Receipt paper has a smaller corner radius than its green stage.

## Components

### Buttons

Onboarding's mint primary button uses deep-teal Bold text and an outline arrow. Its minimum height is 56, or 52 in compact mode. Back, Skip and pagination controls retain accessible 48-unit targets. Press feedback changes opacity to 0.7.

Profile Edit and retry are mint text actions on deep teal with 48-unit minimum targets. Their web keyboard focus outline uses mint; settings rows use dark mint, with width 2 and offset 3. Disabled controls use opacity 0.55 and accessibility state. Profile has no entry animation or choreography; native press and switch feedback communicate state.

### Settings rows

Outline icons sit in field-green tiles beside Bold labels and muted descriptions. One-unit separators divide rows; this is a flat list, not a stack of independent cards. A trailing chevron marks navigation. Pressed rows use the field tint. Log out is separated beneath the groups and uses the local danger tint/red without a navigation chevron; an activity indicator replaces its idle state during sign-out.

### Identity and photo

Display the signed-in user's name, available email, member ID and photo. The existing profile workflow supplies these values and persists photo changes. Initials or a person outline cover absent/failed photos; the camera badge becomes a busy indicator while saving. Skeletons communicate loading; errors expose a retry action. Neither the approved concept's sample name nor gallery fixture data belongs in the shipped identity.

### Device security

Face ID uses React Native's native `Switch`, a mint enabled track, border-colored disabled track and white thumb. Keep the conditional visibility inherited from `utils/biometrics.ts`: supported, enrolled iOS facial recognition outside Expo Go. Its control area is at least 52 wide and 48 high. Show a busy indicator while the preference changes.

### Onboarding artwork

Mint Welcome uses the existing coin-hand asset. Receipt Focus uses the implemented receipt illustration, visibly labeled as an example. Their presentation supports onboarding; it does not establish decorative imagery or sample financial data for account screens.

### Navigation

The existing shell remains the five-tab Home, Learn, Scan, Fin and Profile dock. Its deep-teal container, mint active accents, pale-teal idle states and raised central Scan action are source facts. The dock is owned outside Profile and hides when the keyboard is visible. Its existing selection spring and iOS selection haptic are shell behavior, not Profile entry motion.

### Fields and other routes

The approved onboarding/Profile surfaces do not define a new input component. Older routes have not been audited or migrated. Observed drift includes `Poppins_500Medium` referenced in login without being loaded by the root, a white label on a mint landing action, and other inks, white surfaces and field radii in Edit Profile. This document records those differences without approving them as system variants or changing them.

## Do's and Don'ts

### Do:
- **Do** preserve the approved Poppins, mint and deep-teal identity when extending onboarding or Profile.
- **Do** keep Profile's native settings rows flat, separated and readable at larger text sizes.
- **Do** preserve safe-area clearance, scroll access and the existing dock's ownership.
- **Do** bind identity and photo states to the signed-in user and device controls to real capability.

### Don't:
- **Don't** promote Profile's composition or contextual state colors into unaudited global defaults.
- **Don't** turn phone frames, synthetic fixture captions or sample identities into application UI.
- **Don't** claim Expo Web previews verify native device behavior.
- **Don't** add Profile entry choreography or replace its native Switch with a decorative control.
