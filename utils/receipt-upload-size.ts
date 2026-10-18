// Base64 is ASCII and grows decoded image bytes by about 4/3. Leave room for
// JSON and headers beneath Vercel's 4.5 MB request limit (not the parser limit).
export const MAX_RECEIPT_BASE64_LENGTH = 4_000_000;
export const RECEIPT_IMAGE_TOO_LARGE = "The receipt image is still too large. Crop closely around the receipt or choose a smaller image, then try again.";
