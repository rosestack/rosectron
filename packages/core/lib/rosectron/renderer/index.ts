import type { InlineConfig, ViteDevServer } from "vite";
import { createServer, build, createLogger } from "vite";

import commonjsExternals from "vite-plugin-commonjs-externals";
import tsconfigPaths from "vite-tsconfig-paths";

import type Rosectron from "~/rosectron";

import RosectronLogger from "~shared/logger";

import type { PackageJson, TsConfig } from "~shared/types";

import { loadPackageJson, loadTsConfig, loadEnv } from "~shared/loader";

import { builtinModules } from "module";
import path from "path";
import fs from "fs";
import { normalizePath } from "~shared/utils";

interface RendererConfig {
  package: string;
  entry: string | {
    [ key: string ]: string;
  };
}

class Renderer {
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
    return this.rosectron.config.renderer!;
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
      return path.join(this.rosectron.root, "app", "renderer");
    }

    return path.join(this.root, "dist");
  }

  get url() {
    return this.server.resolvedUrls?.local?.[0];
  }

  getRoot = () => {
    const relativePath = path.join(this.rosectron.root, this.rosectron.config.renderer!.package);

    if ( fs.existsSync(relativePath) ) {
      return relativePath;
    }

    const resolvedPath = require.resolve(path.join(this.rosectron.config.renderer!.package, "package.json"), {
      paths: [this.rosectron.root],
    });

    if ( fs.existsSync(resolvedPath) ) {
      return path.dirname(resolvedPath);
    }

    throw new Error("Renderer package not found");
  };

  init = () => {
    this.logger = new RosectronLogger({
      symbol: "✳",
      name: "Renderer",
      color: "renderer",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    this.root = this.getRoot();

    this.env = loadEnv(this.root, this.rosectron.config.mode);

    this.packageJson = loadPackageJson(this.root!);
    this.tsConfig = loadTsConfig(this.root!);
  };

  //

  getExternals = () => {
    const externals = [
      "electron",
    ];

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

    if ( this.rosectron.preload ) {
      Reflect.set(env, "PRELOAD_ROOT", normalizePath(this.rosectron.preload.root));
      Reflect.set(env, "PRELOAD_DIR", normalizePath(this.rosectron.preload.dir));
    }

    Reflect.set(env, "RENDERER_ROOT", normalizePath(this.root));
    Reflect.set(env, "RENDERER_DIR", normalizePath(this.dir));

    return Object.fromEntries(Object.entries(env).map(( [ key, value ] ) => {
      return [ `process.env.${ key }`, JSON.stringify(value) ];
    }));
  };

  get options(): InlineConfig {
    const externals = this.getExternals();

    const esmExternal: string[] = [];
    const cjsExternal: string[] = [];

    externals.forEach(( external ) => {
      if ( builtinModules.includes(external) || external.startsWith("node:") ) {
        return esmExternal.push(external);
      }

      try {
        const packageJsonPath = require.resolve(path.join(external, "package.json"), {
          paths: [this.root],
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

    logger.info = ( msg ) => {
      return this.logger.info(msg);
    };
    logger.warn = ( msg ) => {
      return this.logger.warn(msg);
    };
    logger.error = ( msg ) => {
      return this.logger.error(msg);
    };

    return {
      root: this.root,
      server: {
        fs: {
          strict: false,
        },
      },
      base: "./",
      build: {
        rollupOptions: {
          input: this.entry,
          external: esmExternal,
        },
        outDir: this.dir,
        emptyOutDir: true,
        reportCompressedSize: false,
      },
      plugins: [
        tsconfigPaths({
          root: this.root,
        }),
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
      envFile: false,
      define: this.getEnv(),
    };
  }

  build = async () => {
    await build(this.options);
  };

  server: ViteDevServer;

  watch = async () => {
    this.logger.info("Starting server...");
    this.server = await createServer(this.options);
    await this.server.listen();
    this.logger.info("Server started");
  };
}

export type {
  RendererConfig,
};

export default Renderer;