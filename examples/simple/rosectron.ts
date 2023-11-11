import { defineRosectron } from "rosectron";

export default defineRosectron({
  main: {
    package: "@electron/main",
    entry: "source/index.ts",
    pack: {
      mergeDevDependencies: true,
    },
  },
  preload: [
    {
      id: "primary",
      package: "@preloads/primary",
    },
    {
      id: "secondary",
      package: "@preloads/secondary",
    },
  ],
  renderer: [
    {
      id: "primary",
      package: "@renderers/primary",
    },
    {
      id: "secondary",
      package: "@renderers/secondary",
    },
  ],
  builder: {
    config: {
      asar: false,
      publish: {
        provider: "github",
        owner: "rosestack",
        repo: "rosectron",
      },
    },
  },
});