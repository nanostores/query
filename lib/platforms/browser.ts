import { PlatformCompat } from "./type";

const canSub = typeof window !== "undefined";

export const browserCompat: PlatformCompat = [
  () => !document.hidden,
  (cb) => canSub && addEventListener("visibilitychange", cb),
  (cb) => canSub && addEventListener("online", cb),
];
