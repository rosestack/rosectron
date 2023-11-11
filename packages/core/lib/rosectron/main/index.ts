import type { ExecaChildProcess } from "execa";
import { execa } from "execa";

import psTree from "ps-tree";

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
import { loadPackageJson, loadTsConfig, loadEnv } from "~shared/loader";

import { builtinModules } from "module";

import path from "path";
import fs from "fs";

interface MainConfig extends ElectronConfig {
  /**
   * entry file
   * @default package.json main
   */
  entry?: string;
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

class Main extends Electron {
  constructor(public rosectron: Rosectron, public config: MainConfig) {
    super(ElectronType.MAIN);
  }

  get entry() {
    if ( this.config.entry ) {
      return path.join(this.cwd, this.config.entry);
    }

    if ( this.packageJson.main ) {
      return path.join(this.cwd, this.packageJson.main);
    }

    throw Error("No entry file for main process");
  }

  get file() {
    return path.join(this.dir, "index.cjs");
  }

  get dir() {
    if ( this.rosectron.config.mode === "production" ) {
      return path.join(this.rosectron.root, "main");
    }

    return path.join(this.cwd, "dist");
  }

  init = () => {
    this.logger = new RosectronLogger({
      symbol: "✤",
      name: "Main",
      color: "main",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    if ( !fs.existsSync(this.entry) ) {
      throw new Error("entry not found");
    }

    this.env = loadEnv(this.cwd, this.rosectron.config.mode);

    this.packageJson = loadPackageJson(this.cwd!);
    this.tsConfig = loadTsConfig(this.cwd!);
  };

  get getExternals() {
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
  }

  get options(): RollupOptions {
    return {
      input: this.entry,
      output: {
        file: this.file,
        format: "cjs",
      },
      treeshake: true,
      plugins: [
        polyfillPlugin({
          electron: this,
        }),
        resolvePlugin({
          compilerOptions: this.tsConfig.compilerOptions,
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

        if ( source.startsWith("rosectron") || source.startsWith("@rosectron") ) {
          return false;
        }

        let moduleName = source.split("/")[0];

        if ( moduleName?.startsWith("@") ) {
          moduleName += `/${source.split("/")[1]}`;
        }

        moduleName = normalizePath(moduleName!);

        for ( const external of this.getExternals ) {
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

    return new Promise<void>((resolve) => {
      this.childProcess?.removeAllListeners();

      this.childProcess?.on("exit", () => {
        return resolve();
      });

      if ( this.childProcess?.pid ) {
        psTree(this.childProcess.pid, (err, processes) => {
          processes = processes.filter((process) => {
            return !process.COMMAND.includes("electron");
          });

          for ( const { PID } of processes ) {
            process.kill(Number(PID));
          }
        });
      }
    });
  };

  start = async (restarted = false) => {
    if ( restarted ) {
      this.logger.info("Restarting...");
      await this.closeAndWait();
    }

    this.childProcess = execa("electron", [this.file], {
      cwd: this.rosectron.config.mode === "production" ? this.rosectron.root : this.cwd,
      env: {
        "FORCE_COLOR": "3",
        ...this.getEnv(false),
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

    this.childProcess.stdout!.on("data", (data) => {
      const messages = data.toString().trim().split("\n");
      const filteredMessages = messages.filter((message: string) => {
        return message.length > 0;
      });

      if ( filteredMessages.length === 0 ) {
        return;
      }

      for ( const message of filteredMessages ) {
        this.logger.logout(message);
      }
    });
    this.childProcess.stderr!.on("data", (data) => {
      const messages = data.toString().trim().split("\n");
      const filteredMessages = messages.filter((message: string) => {
        return message.length > 0;
      });

      if ( filteredMessages.length === 0 ) {
        return;
      }

      for ( const message of filteredMessages ) {
        this.logger.logerr(message);
      }
    });

    this.childProcess.on("error", (error) => {
      this.logger.error(error);
    });
    this.childProcess.on("exit", (code) => {
      if ( code === 0 ) {
        this.logger.info(`Exited with code ${code}`);
      } else {
        this.logger.error(`Exited with code ${code}`);
      }

      process.exit();
    });

    this.logger.info(`Press ${this.logger.mark("m")} to restart`);

    if ( restarted ) {
      return;
    }

    process.stdin.on("data", (key) => {
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