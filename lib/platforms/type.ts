type IsAppVisible = () => boolean;
type VisibilityChangeSubscribe = (cb: () => void) => void;
type ReconnectChangeSubscribe = (cb: () => void) => void;

export type PlatformCompat = [
  IsAppVisible,
  VisibilityChangeSubscribe,
  ReconnectChangeSubscribe
];
