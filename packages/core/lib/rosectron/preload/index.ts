import type { RollupOptions } from "rollup";
import { rollup, watch } from "rollup";

import nodeResolvePlugin from "@rollup/plugin-node-resolve";
import commonjsPlugin from "@rollup/plugin-commonjs";
import replacePlugin from "@rollup/plugin-replace";
import jsonPlugin from "@rollup/plugin-json";
import swcPlugin from "@rollup/plugin-swc";

import resolvePlugin from "~rosectron/common/plugins/resolve";

import type Rosectron from "~/rosectron";

import RosectronLogger from "~shared/logger";

import { normalizePath } from "~shared/utils";
import { loadPackageJson, loadTsConfig } from "~shared/loader";
import type { PackageJson, TsConfig } from "~shared/types";

import { builtinModules } from "module";
import path from "path";
import fs from "fs";


interface PreloadConfig {
  package: string;
  entry: string | {
    [ key: string ]: string;
  };
}

class Preload {
  root: string;

  packageJson: PackageJson;
  tsConfig: TsConfig;

  logger: RosectronLogger;

  env: Record<string, string> = {};

  rosectron: Rosectron;

  constructor( rosectron: Rosectron ) {
    this.rosectron = rosectron;
  }

  get config() {
    return this.rosectron.config.preload!;
  }

  get entry() {
    const entry = this.config.entry;

    if ( typeof entry === "string" ) {
      return path.join(this.root, entry);
    }

    return Object.fromEntries(Object.entries(entry).map(( [ key, value ] ) => {
      return [ key, path.join(this.root, value) ];
    }));
  }

  get dir() {
    if ( this.rosectron.config.mode === "production" ) {
      return path.join(this.rosectron.root, "app", "preload");
    }

    return path.join(this.root, "dist");
  }

  getRoot = () => {
    const relativePath = path.join(this.rosectron.root, this.config.package);

    if ( fs.existsSync(relativePath) ) {
      return relativePath;
    }

    const resolvedPath = require.resolve(path.join(this.config.package, "package.json"), {
      paths: [this.rosectron.root],
    });

    if ( fs.existsSync(resolvedPath) ) {
      return path.dirname(resolvedPath);
    }

    throw new Error("package not found");
  };

  init = () => {
    this.logger = new RosectronLogger({
      symbol: "✳",
      name: "Preload",
      color: "preload",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    this.root = this.getRoot();

    this.packageJson = loadPackageJson(this.root!);
    this.tsConfig = loadTsConfig(this.root!);
  };

  getExternals = () => {
    const externals = [
      "electron",
    ];

    const dependencies = Object.keys(this.packageJson.dependencies || {});
    externals.push(...dependencies);

    const rootDependencies = Object.keys(this.rosectron.packageJson.dependencies || {});
    externals.push(...rootDependencies);

    builtinModules.forEach(( module ) => {
      externals.push(module, `node:${ module }`);
    });

    return externals;
  };

  getEnv = () => {
    const env: Record<string, string> = {
      ...this.rosectron.env,
      ...this.env,
    };

    Reflect.set(env, "NODE_ENV", this.rosectron.config.mode);

    Reflect.set(env, "MAIN_ROOT", normalizePath(this.rosectron.main.root));
    Reflect.set(env, "MAIN_DIR", normalizePath(this.rosectron.main.dir));

    Reflect.set(env, "PRELOAD_ROOT", normalizePath(this.root));
    Reflect.set(env, "PRELOAD_DIR", normalizePath(this.dir));

    if ( this.rosectron.renderer ) {
      Reflect.set(env, "RENDERER_ROOT", normalizePath(this.rosectron.renderer.root));
      Reflect.set(env, "RENDERER_DIR", normalizePath(this.rosectron.renderer.dir));

      if ( this.rosectron.config.mode === "development" ) {
        Reflect.set(env, "RENDERER_URL", this.rosectron.renderer.url);
      }
    }

    return Object.fromEntries(Object.entries(env).map(( [ key, value ] ) => {
      return [ `process.env.${ key }`, JSON.stringify(value) ];
    }));
  };

  get options(): RollupOptions {
    return {
      input: this.entry,
      output: {
        dir: this.dir,
        format: "cjs",
      },
      plugins: [
        nodeResolvePlugin({
          rootDir: this.root,
          mainFields: [
            "module",
            "main",
          ],
          extensions: [ ".js", ".cjs", ".mjs", ".jsx", ".ts", ".tsx", ".json", ".node" ],
          preferBuiltins: true,
          browser: false,
        }),
        resolvePlugin({
          compilerOptions: this.tsConfig.compilerOptions,
        }),
        commonjsPlugin({
          esmExternals: true,
        }),
        jsonPlugin(),
        replacePlugin({
          preventAssignment: true,
          objectGuards: true,
          values: this.getEnv(),
        }),
        swcPlugin(),
      ],
      external: ( source, importer ) => {
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
          moduleName += `/${ source.split("/")[1] }`;
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

    rollupWatch.on("event", ( event ) => {
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

    rollupWatch.on("change", ( file, change ) => {
      const { event } = change;

      const relativePath = path.relative(this.root, file);

      if ( event === "update" ) {
        console.info(`${ this.logger.mark(relativePath) } changed`);
      } else if ( event === "delete" ) {
        console.info(`${ this.logger.mark(relativePath) } removed`);
      } else if ( event === "create" ) {
        console.info(`${ this.logger.mark(relativePath) } added`);
      }
    });
  };
}

export type {
  PreloadConfig,
};

export default Preload;