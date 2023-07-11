import { defineRosepack } from "rosepack";

export default defineRosepack({
  defineRuntime: {
    mode: false,
  },
  output: {
    esm: {
      shims: true,
    },
  },
  declaration: true,
  clean: true,
});