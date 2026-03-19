import { PlatformCompat } from "./type";

const subscribe = (name: string, fn: () => void) =>
  typeof window !== "undefined" && addEventListener(name, fn);

export const browserCompat: PlatformCompat = [
  () => !document.hidden,
  (cb) => subscribe("visibilitychange", cb),
  (cb) => subscribe("online", cb),
];
