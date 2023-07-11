import type { Configuration } from "electron-builder";
import { build } from "electron-builder";

import RosectronLogger from "~shared/logger";

import { deepMerge } from "~shared/utils";

import type { PackageJson, TsConfig } from "~shared/types";
import { loadConfig, loadPackageJson, loadTsConfig, loadEnv } from "~shared/loader";

import type { MainConfig } from "~rosectron/main";
import Main from "~rosectron/main";

import type { RendererConfig } from "~rosectron/renderer";
import Renderer from "~rosectron/renderer";

import type { PreloadConfig } from "~rosectron/preload";
import Preload from "~rosectron/preload";
import path from "path";
import fs from "fs";

interface Config {
  mode: "development" | "preview" | "production";
  main: MainConfig;
  preload?: PreloadConfig;
  renderer?: RendererConfig;
  resources?: string | string[];
  builder?: {
    config: Configuration;
  };
}

class Rosectron {
  root: string;

  config: Config;

  packageJson: PackageJson;
  tsConfig: TsConfig;

  main: Main;
  preload?: Preload;
  renderer?: Renderer;

  logger: RosectronLogger;

  env: Record<string, string> = {};

  private readonly priorityConfig: Config;

  //

  constructor(priorityConfig: Config) {
    this.priorityConfig = priorityConfig;
  }

  get defaultConfig(): Config {
    return {
      mode: "development",
      main: {
        package: "@electron/main",
        entry: "source/index.ts",
      },
      preload: {
        package: null as any,
        entry: "source/index.html",
      },
      renderer: {
        package: null as any,
        entry: "source/index.ts",
      },
      resources: "resources",
    };
  }

  init = async () => {
    this.root = process.cwd();

    this.config = deepMerge(this.defaultConfig, this.priorityConfig);

    this.logger = new RosectronLogger({
      symbol: "❁",
      name: "Rosectron",
      color: "rosectron",
      time: false,
      levels: {
        info: true,
        warn: true,
        error: true,
      },
    });

    const userConfig = await loadConfig(this.root, this.config);
    this.config = deepMerge(this.defaultConfig, userConfig, this.priorityConfig);

    this.packageJson = loadPackageJson(this.root);
    this.tsConfig = loadTsConfig(this.root);

    try {
      this.main = new Main(this);
      await this.main.init();
    } catch ( error ) {
      this.logger.error("Failed to initialize main process");
      this.main.logger.error(error);
      process.exit(1);
    }

    try {
      if ( this.config.preload?.package ) {
        this.preload = new Preload(this);
        await this.preload.init();
      }
    } catch ( error ) {
      this.logger.error("Failed to initialize preload process");
      this.preload?.logger.error(error);
      process.exit(1);
    }

    try {
      if ( this.config.renderer?.package ) {
        this.renderer = new Renderer(this);
        await this.renderer.init();
      }
    } catch ( error ) {
      this.logger.error("Failed to initialize renderer process");
      this.renderer?.logger.error(error);
      process.exit(1);
    }

    const dotEnv = loadEnv(this.root, this.config.mode);

    this.env = {
      ...dotEnv,
      ROOT_DIR: this.root,
    };
  };

  run = async () => {
    this.logger.info("Running rosectron");
    this.logger.info(`Press ${ this.logger.mark("q") } to quit`);
    this.logger.line();

    if ( this.config.mode === "development" ) {
      await this.renderer?.watch();
      this.preload?.watch();
      this.main.watch();
    } else {
      await Promise.all([
        this.renderer?.build(),
        this.preload?.build(),
        this.main.build(),
      ]);
    }

    return this.main.start();
  };

  pack = async () => {
    this.logger.info("Building rosectron");
    this.logger.line();

    await Promise.all([
      this.renderer?.build(),
      this.preload?.build(),
      this.main.build(),
    ]);

    const packageJsonPath = path.join(this.root, "app", "package.json");

    this.packageJson.dependencies = {
      ...this.packageJson.dependencies,
      ...this.main.packageJson.dependencies,
      ...this.preload?.packageJson.dependencies,
    };

    this.packageJson.scripts = {
      postinstall: "electron-builder install-app-deps",
    };

    await fs.promises.writeFile(packageJsonPath, JSON.stringify(this.packageJson, null, 2));

    this.logger.line();
    this.logger.info("Packing rosectron");
    this.logger.line();

    const resources = Array.isArray(this.config.resources) ? this.config.resources : [this.config.resources];

    try {
      await build({
        projectDir: this.root,
        config: deepMerge(this.config.builder?.config, {
          directories: {
            buildResources: path.join(this.root, "buildResources"),
            output: path.join(this.root, "buildOutput", "${os} ${arch}"),
          },
          extraFiles: resources.map((resource) => ({
            from: resource,
            to: `${ resource }/${ resource }`,
          })),
        }),
        publish: null,
      });
    } catch ( error ) {
      this.logger.line();
      this.logger.error("Failed to pack production package");
      this.logger.error(error);
      process.exit(1);
    }

    this.logger.info("Done");
    process.exit();
  };
}

const defineRosectron = (config: Config | ((config: Config) => Config)) => {
  return config;
};

export type {
  Config,
};

export {
  defineRosectron,
};

export default Rosectron;
 