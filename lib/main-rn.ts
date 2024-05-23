import { nanoqueryFactory } from "./factory";
import { reactNativeCompat } from "./platforms/react-native";

export const nanoquery = nanoqueryFactory(reactNativeCompat);
