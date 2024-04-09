import { resolve, join } from "path";
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";
import strip from "@rollup/plugin-strip";

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
  },
  build: {
    target: "esnext",
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
    {
      ...strip({
        include: ["**/*.(ts|js)"],
        // Intentionally leave out console.warn here
        functions: ["console.log"],
      }),
      apply: "build",
    },
    dts({
      entryRoot: join(__dirname, "lib"),
      exclude: [join(__dirname, "lib", "__tests__")],
    }),
  ],
});
