import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { ScrollView, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { GuideTarget } from "../components/home-guide";

export function useGuideTargets(step: 0 | 1 | 2 | null, scroll?: RefObject<ScrollView | null>) {
  const views = useRef<(View | null)[]>([null, null, null]);
  const offsets = useRef([0, 0, 0]);
  const [box, setBox] = useState<(GuideTarget & { step: number }) | null>(null);
  const { width, height, fontScale } = useWindowDimensions();
  const { top } = useSafeAreaInsets();
  const measure = useCallback(() => {
    if (step === null) return;
    views.current[step]?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      setBox((old) => old?.step === step && old.x === x && old.y === y && old.width === w && old.height === h
        ? old : { step, x, y, width: w, height: h });
    });
  }, [step]);
  useEffect(() => {
    if (step === null) return;
    scroll?.current?.scrollTo({ y: Math.max(0, offsets.current[step] - top - 24), animated: false });
    const frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [step, width, height, fontScale, top, measure, scroll]);
  const layout = (index: 0 | 1 | 2, event: LayoutChangeEvent) => {
    offsets.current[index] = event.nativeEvent.layout.y;
    if (step === index) {
      scroll?.current?.scrollTo({ y: Math.max(0, offsets.current[index] - top - 24), animated: false });
      requestAnimationFrame(measure);
    }
  };
  return {
    ref: (index: 0 | 1 | 2) => (node: View | null) => { views.current[index] = node; },
    layout, measure, target: box?.step === step ? box : null,
    bottomSpace: step === null || !scroll ? 0 : height,
    scrollTo: (index: 0 | 1 | 2) => scroll?.current?.scrollTo({ y: Math.max(0, offsets.current[index] - top - 24), animated: false }),
  };
}
