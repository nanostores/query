import { resolve } from "path";
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";

export default defineConfig({
  test: {
    globals: true,
  },
  esbuild: {
    pure: ["console.log"],
  },
  build: {
    lib: {
      entry: resolve(__dirname, "lib/main.ts"),
      name: "nanofetch",
      // the proper extensions will be added
      fileName: "nanofetch",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["nanostores"],
    },
  },
  plugins: [dts()],
});
