import type { Href, router as ExpoRouter } from 'expo-router';

export function goBackOrReplace(router: Pick<typeof ExpoRouter, 'canGoBack' | 'back' | 'replace'>, fallback: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
