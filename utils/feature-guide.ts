import { createFeatureGuideStore } from "./feature-guide-core";
import { guideStorage } from "./home-guide";

export const featureGuide = createFeatureGuideStore(guideStorage);
