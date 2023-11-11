import type { PluginImpl } from "rollup";

import Electron from "~rosectron/electron";

import { dataToEsm, createFilter } from "@rollup/pluginutils";

import path from "path";

interface PolyfillPluginOptions {
  electron: Electron;
}

const polyfillFilter = createFilter([
  new RegExp("rosectron/paths/helper"),
  new RegExp("rosectron/utils/helper"),
]);

const polyfillPlugin: PluginImpl<PolyfillPluginOptions> = (options) => {
  const { rosectron, dir, type } = options!.electron;

  const paths = {
    mainDir: path.relative(rosectron.main.dir, dir),
    preloads: Object.fromEntries(Array.from(rosectron.preloads.entries()).map(([id, item]) => [
      id, path.relative(rosectron.main.dir, item.dir),
    ])),
    renderers: Object.fromEntries(Array.from(rosectron.renderers.entries()).map(([id, item]) => [
      id, {
        url: item.url,
        dir: path.relative(rosectron.main.dir, item.dir),
      },
    ])),
  };

  const utils = {
    mode: rosectron.config.mode,
    process: type,
  };

  return {
    name: "polyfill",
    enforce: "pre",
    resolveId(id) {
      if ( polyfillFilter(id) ) {
        return id;
      }
    },
    load(id) {
      if ( id === "rosectron/paths/helper" ) {
        return {
          code: dataToEsm(paths, {
            objectShorthand: true,
            namedExports: true,
            preferConst: true,
            compact: true,
          }),
        };
      }

      if ( id === "rosectron/utils/helper" ) {
        return {
          code: dataToEsm(utils, {
            objectShorthand: true,
            namedExports: true,
            preferConst: true,
            compact: true,
          }),
        };
      }
    },
  };
};

export default polyfillPlugin;