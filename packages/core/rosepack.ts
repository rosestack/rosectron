import { defineRosepack } from "rosepack";

export default defineRosepack({
  defineRuntime: {
    mode: false,
  },
  entry: {
    bin: "lib/bin/index.ts",
    rosectron: "lib/rosectron/index.ts",
  },
  output: {
    esm: {
      shims: true,
    },
  },
  declaration: {
    entry: "lib/rosectron/index.ts",
  },
  clean: true,
});