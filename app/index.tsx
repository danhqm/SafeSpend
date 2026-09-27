// app/index.tsx
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { BrandSplash } from "../components/brand-splash";
import { getSavedUserId } from "../utils/offline-session";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void getSavedUserId()
      .then(({ userId }) => {
        if (active) router.replace(userId ? "/(tabs)" : "/splashscreen");
      })
      .catch(() => {
        if (active) router.replace("/login");
      });
    return () => {
      active = false;
    };
  }, [router]);

  return <BrandSplash />;
}
