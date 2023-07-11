import type { ExecaChildProcess } from "execa";
import { execa } from "execa";

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
import { loadPackageJson, loadTsConfig, loadEnv } from "~shared/loader";
import type { PackageJson, TsConfig } from "~shared/types";

import { builtinModules } from "module";
import path from "path";
import fs from "fs";

interface MainConfig {
  package: string;
  entry: string;
}

class Main {
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
    return this.rosectron.config.main;
  }

  get entry() {
    return path.join(this.root, this.config.entry);
  }

  get dir() {
    if ( this.rosectron.config.mode === "production" ) {
      return path.join(this.rosectron.root, "app");
    }

    return path.join(this.root, "dist");
  }

  get file() {
    return path.join(this.dir, "main.cjs");
  }

  getRoot = () => {
    const relativePath = path.join(this.rosectron.root, this.config.package);

    if ( fs.existsSync(relativePath) ) {
      return relativePath;
    }

    const resolvedPath = require.resolve(path.join(this.config.package!, "package.json"), {
      paths: [this.rosectron.root!],
    });

    if ( fs.existsSync(resolvedPath) ) {
      return path.dirname(resolvedPath);
    }

    throw new Error("package not found");
  };

  init = () => {
    this.logger = new RosectronLogger({
      symbol: "✦",
      name: "Main",
      color: "main",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    this.root = this.getRoot();

    const entry = path.join(this.root, this.config.entry);

    if ( !fs.existsSync(entry) ) {
      throw new Error("entry not found");
    }

    this.env = loadEnv(this.root, this.rosectron.config.mode);

    this.packageJson = loadPackageJson(this.root!);
    this.tsConfig = loadTsConfig(this.root!);
  };

  getEnv = ( processEnv = false ) => {
    const env: Record<string, string> = {
      ...this.rosectron.env,
      ...this.env,
    };

    Reflect.set(env, "NODE_ENV", this.rosectron.config.mode);

    Reflect.set(env, "MAIN_ROOT", normalizePath(this.rosectron.main.root));
    Reflect.set(env, "MAIN_DIR", normalizePath(this.rosectron.main.dir));

    if ( this.rosectron.preload ) {
      Reflect.set(env, "PRELOAD_ROOT", normalizePath(this.rosectron.preload.root));
      Reflect.set(env, "PRELOAD_DIR", normalizePath(this.rosectron.preload.dir));
    }

    if ( this.rosectron.renderer ) {
      Reflect.set(env, "RENDERER_ROOT", normalizePath(this.rosectron.renderer.root));
      Reflect.set(env, "RENDERER_DIR", normalizePath(this.rosectron.renderer.dir));

      if ( this.rosectron.config.mode === "development" ) {
        Reflect.set(env, "RENDERER_URL", this.rosectron.renderer.url);
      }
    }

    if ( processEnv ) {
      return Object.fromEntries(Object.entries(env).map(( [ key, value ] ) => {
        return [ `process.env.${ key }`, JSON.stringify(value) ];
      }));
    }

    return env;
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

  get options(): RollupOptions {
    return {
      input: this.entry,
      output: {
        file: this.file,
        format: "cjs",
      },
      treeshake: true,
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
          values: this.getEnv(true),
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

        if ( source.startsWith("rosectron") || source.startsWith("@rosectron") ) {
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

  build = async () => {
    this.logger.info("Bundle started...");
    const rollupBuild = await rollup(this.options);

    this.logger.info("Bundle finished.");
    await rollupBuild.write(this.options.output as any);

    return rollupBuild.close();
  };

  childProcess?: ExecaChildProcess;

  closeAndWait = async () => {
    if ( !this.childProcess ) {
      return Promise.resolve();
    }

    return new Promise<void>(( resolve ) => {
      this.childProcess?.removeAllListeners();
      this.childProcess?.on("exit", () => {
        return setTimeout(() => {
          return resolve();
        }, 1000);
      });
      this.childProcess?.kill();
    });
  };

  start = async ( restarted = false ) => {
    if ( restarted ) {
      this.logger.info("Restarting...");
      await this.closeAndWait();
    }

    this.childProcess = execa("electron", [ this.file, "--no-sandbox" ], {
      cwd: this.rosectron.config.mode === "production" ? this.rosectron.root : this.root,
      env: {
        "FORCE_COLOR": "3",
        ...this.getEnv(),
      } as any,
      extendEnv: true,
      stdio: [
        "inherit",
        "pipe",
        "pipe",
        "ipc",
      ],
    });

    this.childProcess.stderr?.setEncoding("utf-8");
    this.childProcess.stdout?.setEncoding("utf-8");

    this.childProcess.stdout!.on("data", ( data ) => {
      const messages = data.toString().trim().split("\n");
      const filteredMessages = messages.filter(( message: string ) => {
        return message.length > 0;
      });

      if ( filteredMessages.length === 0 ) {
        return;
      }

      for ( const message of filteredMessages ) {
        this.logger.logout(message);
      }
    });
    this.childProcess.stderr!.on("data", ( data ) => {
      const messages = data.toString().trim().split("\n");
      const filteredMessages = messages.filter(( message: string ) => {
        return message.length > 0;
      });

      if ( filteredMessages.length === 0 ) {
        return;
      }

      for ( const message of filteredMessages ) {
        this.logger.logerr(message);
      }
    });

    this.childProcess.on("error", ( error ) => {
      this.logger.error(error);
    });
    this.childProcess.on("exit", ( code ) => {
      if ( code === 0 ) {
        this.logger.info(`Exited with code ${ code }`);
      } else {
        this.logger.error(`Exited with code ${ code }`);
      }

      process.exit();
    });

    if ( !restarted ) {
      return;
    }

    this.logger.info(`Press ${ this.logger.mark("m") } to restart`);

    if ( restarted ) {
      return;
    }

    process.stdin.on("data", ( key ) => {
      if ( Buffer.from(key).toString() === "m" ) {
        return this.start(true);
      }
    });
  };
}

export type {
  MainConfig,
};

export default Main;