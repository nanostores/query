export const noop = () => {};
export const delay = (ms = 0) => new Promise((r) => setTimeout(r, ms));
