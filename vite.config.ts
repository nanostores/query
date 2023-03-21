import { resolve } from "path";
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";
import strip from "@rollup/plugin-strip";

export default defineConfig({
  test: {
    globals: true,
  },
  build: {
    minify: false,
    lib: {
      entry: resolve(__dirname, "lib/main.ts"),
      name: "nanoquery",
      fileName: "nanoquery",
    },
    rollupOptions: {
      external: ["nanostores", "nanoevents"],
    },
  },
  plugins: [
    dts(),
  ],
});
