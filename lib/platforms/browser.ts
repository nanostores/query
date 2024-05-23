import { PlatformCompat } from "./type";

const subscribe = (name: string, fn: () => void) => {
  const isServer = typeof window === "undefined";
  if (!isServer) {
    addEventListener(name, fn);
  }
};

export const browserCompat: PlatformCompat = [
  () => !document.hidden,
  (cb) => subscribe("visibilitychange", cb),
  (cb) => subscribe("online", cb),
];
