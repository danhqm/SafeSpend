# Receipt upload size fix — 17 October 2026

The Book Corner scan failed with HTTP 413 because camera images were sent as
base64 in JSON without a dimension or payload budget. Base64 expands image
bytes by about one third. The backend's 7 MB parser setting and 5 MB decoded
image check cannot increase [Vercel's 4.5 MB function request limit](https://vercel.com/docs/functions/limitations).
The earlier deployment fixed date and structured-error handling but missed this
separate platform limit.

Both the expense scanner and Tax Relief's camera/gallery path now prepare the
image locally with the SDK 57-compatible `expo-image-manipulator` package.
Images become JPEG, keeping the full receipt and its proportions, without
upscaling. Preparation starts at a maximum edge of 2800 pixels and quality 0.85;
if necessary it retries at quality 0.65, then at a 2000-pixel edge. Every retry
starts from the source. Generated native cache files and web blob URLs are
released; the original image is retained.

The prepared image must fit within 4,000,000 base64 characters (approximately
3 MB of decoded image). The shared OCR client independently checks this budget
before any network request, leaving space for JSON and headers. If preparation
cannot fit it, or a server still returns 413, the app asks the user to crop
closely or choose a smaller image. Generic JSON platform errors cannot replace
that guidance. Duplicate retries reuse the same prepared bytes.

## Verification

- Regression tests first reproduced unchecked oversized uploads and generic JSON
  413 messages; both now pass. Image tests cover aspect ratio, no upscaling,
  compression retries, bounded failure, missing image output and invalid input.
- Automated suites: 136 app tests, 21 database tests, 87 backend tests (244 total).
- TypeScript, ESLint and the final web production export pass.
- Used the actual Expo web implementation of `prepareReceiptUpload` and shared
  `scanReceiptImage` in a temporary local screen, removed before the final build:

| Input | Before preparation | JSON request after preparation |
| --- | --- | --- |
| Book Corner fixture, 1024 × 1536 | 1,987,524 bytes PNG | 253,615 bytes |
| Noisy camera simulation, 4032 × 6048 | 29,653,491 characters in JPEG data URI | 1,002,207 bytes |

Both outputs were JPEG and reached the simulated compatible API response through
the real client path. The Book Corner preview retained readable merchant, date,
item names and prices. This verifies image preparation and request sizing, not
a live authenticated OCR/database save. No real user receipt or paid OCR call
was used. Native camera capture and OCR still need a device rescan.

## Delivery

This is an app update; no additional backend deployment or database migration
is required. Reload the running Expo app after Metro picks up the dependency.
Expo Go includes ImageManipulator; a custom development client or standalone app
must be rebuilt if its existing binary does not include this native module.
No Git commit or push was performed for this fix.
