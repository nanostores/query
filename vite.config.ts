import { resolve } from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
  },
  build: {
    lib: {
      entry: resolve(__dirname, "lib/main.js"),
      name: "nanofetch",
      // the proper extensions will be added
      fileName: "nanofetch",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["nanostores"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          vue: "Vue",
        },
      },
    },
  },
});
