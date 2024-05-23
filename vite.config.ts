import { resolve, join } from "path";
import replace from "@rollup/plugin-replace";
import { defineConfig } from "vitest/config";
import dts from "vite-plugin-dts";
import strip from "@rollup/plugin-strip";

const target = process.env.TARGET || "web";

const webBuild = {
  outDir: "dist",
  target: "esnext",
  minify: false,
  lib: {
    entry: resolve(__dirname, `lib/main${target === "web" ? "" : "-rn"}.ts`),
    name: "nanoquery",
    fileName: "nanoquery",
  },
  rollupOptions: {
    external: [
      "nanostores",
      "nanoevents",
      "react-native",
      "@react-native-community/netinfo",
    ],
  },
};
const rnBuild = structuredClone(webBuild);
rnBuild.outDir = "rn-dist";
// @ts-expect-error
rnBuild.lib.formats = ["cjs"];

export default defineConfig({
  test: {
    globals: true,
    environment: "happy-dom",
  },
  build: target === "web" ? webBuild : rnBuild,
  plugins: [
    replace({
      preventAssignment: true,
      "process.env.RN": JSON.stringify(target !== "web"),
    }),
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
