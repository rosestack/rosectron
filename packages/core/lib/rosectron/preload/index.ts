import type { RollupOptions } from "rollup";
import { rollup, watch } from "rollup";

import type { FilterPattern } from "@rollup/pluginutils";

import nodeResolvePlugin from "@rollup/plugin-node-resolve";
import commonjsPlugin from "@rollup/plugin-commonjs";
import replacePlugin from "@rollup/plugin-replace";
import jsonPlugin from "@rollup/plugin-json";
import swcPlugin from "@rollup/plugin-swc";

import polyfillPlugin from "~rosectron/common/plugins/polyfill";
import resolvePlugin from "~rosectron/common/plugins/resolve";

import type Rosectron from "~/rosectron";
import Electron, { ElectronConfig, ElectronType } from "~rosectron/electron";

import RosectronLogger from "~shared/logger";

import { normalizePath } from "~shared/utils";
import { loadPackageJson, loadTsConfig } from "~shared/loader";

import { builtinModules } from "module";
import path from "path";

interface PreloadConfig extends ElectronConfig {
  /**
   * preload package identifier
   */
  id: string;
  /**
   * entry file
   * @default package.json main
   */
  entry?: string | {
    [key: string]: string;
  };
  /**
   * pack configuration
   */
  pack?: {
    /**
     * include dependencies in the final app
     */
    mergeDependencies?: boolean | {
      include?: FilterPattern;
      exclude?: FilterPattern;
    };
    /**
     * exclude dependencies from the final app
     */
    mergeDevDependencies?: boolean | {
      include?: FilterPattern;
      exclude?: FilterPattern;
    };
  };
}

class Preload extends Electron {
  constructor(public rosectron: Rosectron, public config: PreloadConfig) {
    super(ElectronType.Preload);
  }

  get entry() {
    let entry = this.config.entry;

    if ( entry === undefined ) {
      entry = this.packageJson.main;

      if ( entry === undefined ) {
        throw Error("No entry file for preload process");
      }
    }

    if ( typeof entry === "string" ) {
      return path.join(this.cwd, entry);
    }

    return Object.fromEntries(Object.entries(entry).map(([key, value]) => {
      return [key, path.join(this.cwd, value)];
    }));
  }

  get dir() {
    if ( this.rosectron.config.mode === "production" ) {
      return path.join(this.rosectron.root, "preload", this.config.id);
    }

    return path.join(this.cwd, "dist");
  }

  init = () => {
    this.logger = new RosectronLogger({
      symbol: "✱",
      name: `Preload [${this.config.id}]`,
      color: "preload",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    this.packageJson = loadPackageJson(this.cwd!);
    this.tsConfig = loadTsConfig(this.cwd!);
  };

  getExternals = () => {
    const externals = [
      "electron",
    ];

    const dependencies = Object.keys(this.packageJson.dependencies || {});
    externals.push(...dependencies);

    const rootDependencies = Object.keys(this.rosectron.packageJson.dependencies || {});
    externals.push(...rootDependencies);

    builtinModules.forEach((module) => {
      externals.push(module, `node:${module}`);
    });

    return externals;
  };

  get options(): RollupOptions {
    return {
      input: this.entry,
      output: {
        dir: this.dir,
        format: "cjs",
      },
      plugins: [
        polyfillPlugin({
          electron: this,
        }),
        nodeResolvePlugin({
          rootDir: this.cwd,
          mainFields: [
            "module",
            "main",
          ],
          extensions: [".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".json", ".node"],
          preferBuiltins: true,
          browser: false,
        }),
        resolvePlugin({
          compilerOptions: this.tsConfig.compilerOptions,
        }),
        // @ts-ignore
        commonjsPlugin({
          esmExternals: true,
        }),
        // @ts-ignore
        jsonPlugin(),
        // @ts-ignore
        replacePlugin({
          preventAssignment: true,
          objectGuards: true,
          values: this.getEnv(),
        }),
        // @ts-ignore
        swcPlugin(),
      ],
      external: (source, importer) => {
        if ( importer === undefined ) {
          return false;
        }

        if ( path.isAbsolute(source) ) {
          return false;
        }

        if ( source.startsWith(".") ) {
          return false;
        }

        let moduleName = source.split("/")[0];

        if ( moduleName?.startsWith("@") ) {
          moduleName += `/${source.split("/")[1]}`;
        }

        moduleName = normalizePath(moduleName!);

        for ( const external of this.getExternals() ) {
          if ( moduleName === external ) {
            return true;
          }
        }

        return false;
      },
    };
  }

  build = async () => {
    this.logger.info("Bundle started...");
    const rollupBuild = await rollup(this.options);

    this.logger.info("Bundle finished.");
    await rollupBuild.write(this.options.output as any);

    return rollupBuild.close();
  };

  watch = () => {
    const rollupWatch = watch(this.options);

    rollupWatch.on("event", (event) => {
      if ( event.code === "ERROR" ) {
        return this.logger.error(event.error);
      }

      if ( event.code === "BUNDLE_START" ) {
        return this.logger.info("Bundling started...");
      }

      if ( event.code === "BUNDLE_END" ) {
        return this.logger.info("Bundle finished.");
      }
    });

    rollupWatch.on("change", (file, change) => {
      const { event } = change;

      const relativePath = path.relative(this.cwd, file);

      if ( event === "update" ) {
        console.info(`${this.logger.mark(relativePath)} changed`);
      } else if ( event === "delete" ) {
        console.info(`${this.logger.mark(relativePath)} removed`);
      } else if ( event === "create" ) {
        console.info(`${this.logger.mark(relativePath)} added`);
      }
    });
  };
}

export type {
  PreloadConfig,
};

export default Preload;