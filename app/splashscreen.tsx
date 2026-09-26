import { useRouter } from "expo-router";
import { useEffect } from "react";
import { BrandSplash } from "../components/brand-splash";

export default function SplashScreen() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace("/onboarding"), 1400);

    return () => clearTimeout(timer);
  }, [router]);

  return <BrandSplash />;
}
