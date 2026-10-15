# SafeSpend

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

## Users

Signed-in SafeSpend users managing personal details, financial accounts, receipt-based tax relief, and optional device unlock settings.

## Product Purpose

SafeSpend helps users understand and manage their money. Its existing flows cover expense tracking, financial accounts, receipt scanning, money education, and Malaysian LHDN tax relief review.

## Capabilities and Constraints

- Profile displays the user's name, member ID and avatar. Users can choose a profile photo and edit their username, mobile number, date of birth and monthly income through the existing editor.
- Accounts manages cash, bank, credit card and e-wallet accounts and their transfers.
- LHDN Tax Relief supports organizing and reviewing claims and their receipt evidence.
- Optional Face ID is available only on supported, enrolled iPhones outside Expo Go. Enabling it requires device authentication.
- Logout signs out the user and clears the saved user-specific Home data.
- The existing five-tab navigation and authenticated route guards remain in place.
- The application uses React Native and Expo with Expo Router. Web rendering is also available for development verification.

## Brand Commitments

The user approved a calm and trustworthy SafeSpend identity, the existing Poppins typography and mint/deep-teal palette, and the Mint Welcome and Receipt Focus onboarding implementations. The approved profile mockup carries this identity into a personal account hub.

## Evidence on Hand

The profile redesign preserves the features verified in `app/(tabs)/profile.tsx`, `app/editprofile.tsx`, `app/accounts.tsx`, `app/lhdn.tsx` and `utils/biometrics.ts`. The user approved the profile concept on 15 October 2026. Names and details in the design concept are explicitly illustrative; the production screen uses the signed-in user's data.

## Product Principles

- Keep account actions recognizable and reachable.
- Preserve the existing finance and authentication flows.
- Present user data and device capability states honestly.
- Support safe areas, large text and accessible controls.
