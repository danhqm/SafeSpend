// app/index.tsx
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { BrandSplash } from "../components/brand-splash";
import { supabase } from "../utils/supabase";

export default function Index() {
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) router.replace(data.session ? "/(tabs)" : "/splashscreen");
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
