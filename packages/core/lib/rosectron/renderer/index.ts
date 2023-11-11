import type { InlineConfig, ViteDevServer } from "vite";
import { createServer, build, createLogger } from "vite";

import type { FilterPattern } from "@rollup/pluginutils";

import commonjsExternals from "vite-plugin-commonjs-externals";

import tsconfigPaths from "vite-tsconfig-paths";
import react from "@vitejs/plugin-react-swc";

import polyfillPlugin from "~rosectron/common/plugins/polyfill";

import type Rosectron from "~/rosectron";

import Electron, { ElectronConfig, ElectronType } from "~rosectron/electron";

import RosectronLogger from "~shared/logger";

import { loadPackageJson, loadTsConfig, loadEnv } from "~shared/loader";

import { builtinModules } from "module";

import path from "path";

interface RendererConfig extends ElectronConfig {
  /**
   * renderer package identifier
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

class Renderer extends Electron {
  constructor(public rosectron: Rosectron, public config: RendererConfig) {
    super(ElectronType.Renderer);
  }

  get entry() {
    let entry = this.config.entry;

    if ( entry === undefined ) {
      entry = this.packageJson.main;

      if ( entry === undefined ) {
        throw Error("No entry file for renderer process");
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
      return path.join(this.rosectron.root, "renderer", this.config.id);
    }

    return path.join(this.cwd, "dist");
  }

  get url() {
    return this.server?.resolvedUrls?.local?.[0]?.slice(0, -1);
  }

  init = () => {
    this.logger = new RosectronLogger({
      symbol: "✸",
      name: `Renderer [${this.config.id}]`,
      color: "renderer",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    this.env = loadEnv(this.cwd, this.rosectron.config.mode);

    this.packageJson = loadPackageJson(this.cwd!);
    this.tsConfig = loadTsConfig(this.cwd!);
  };

  //

  getExternals = () => {
    const externals = [
      "electron",
      "@electron/remote",
    ];

    builtinModules.forEach((module) => {
      externals.push(module, `node:${module}`);
    });

    return externals;
  };

  get options(): InlineConfig {
    const externals = this.getExternals();

    const esmExternal: string[] = [];
    const cjsExternal: string[] = [];

    externals.forEach((external) => {
      if ( builtinModules.includes(external) || external.startsWith("node:") ) {
        return cjsExternal.push(external);
      }

      try {
        const packageJsonPath = require.resolve(path.join(external, "package.json"), {
          paths: [this.cwd],
        });

        const packageJson = loadPackageJson(path.dirname(packageJsonPath));

        if ( packageJson.type === "module" ) {
          return esmExternal.push(external);
        }

        return cjsExternal.push(external);
      } catch {
        return esmExternal.push(external);
      }
    });

    const logger = createLogger("info", {
      allowClearScreen: false,
    });

    logger.info = (msg) => {
      return this.logger.info(msg);
    };
    logger.warn = (msg) => {
      return this.logger.warn(msg);
    };
    logger.error = (msg) => {
      return this.logger.error(msg);
    };

    return {
      root: this.cwd,
      base: "./",
      server: {
        fs: {
          strict: false,
        },
      },
      build: {
        rollupOptions: {
          input: this.entry,
        },
        outDir: this.dir,
        emptyOutDir: true,
        reportCompressedSize: false,
        modulePreload: {
          polyfill: false,
        },
        commonjsOptions: {
          transformMixedEsModules: true,
        },
      },
      plugins: [
        // @ts-ignore
        polyfillPlugin({
          electron: this,
        }),
        tsconfigPaths({
          root: this.cwd,
          ignoreConfigErrors: true,
        }),
        react(),
        commonjsExternals({
          externals: cjsExternal,
        }),
      ],
      customLogger: logger,
      optimizeDeps: {
        exclude: [
          ...esmExternal,
          ...cjsExternal,
        ],
      },
      define: this.getEnv(),
      envFile: false,
    };
  }

  build = async () => {
    await build(this.options);
  };

  server: ViteDevServer;

  watch = async () => {
    this.logger.info("Starting server...");

    this.server = await createServer(this.options).then((server) => {
      return server.listen();
    });

    this.logger.info("Server started");
  };
}

export type {
  RendererConfig,
};

export default Renderer;