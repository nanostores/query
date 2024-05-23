// @ts-expect-error: don't want to make development setup complex, so I don't actually install it
import { AppState } from "react-native";

let NetInfo: any = null;
try {
  NetInfo = require("@react-native-community/netinfo").NetInfo;
} catch (err) {}

import { PlatformCompat } from "./type";

export const reactNativeCompat: PlatformCompat = [
  () => AppState.currentState === "active",
  (cb) => AppState.addEventListener("change", cb),
  (cb) => NetInfo?.addEventListener(cb),
];
