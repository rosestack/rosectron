import { createFilter } from "@rollup/pluginutils";

import type { CliOptions } from "electron-builder";
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
  preload?: PreloadConfig | PreloadConfig[];
  renderer?: RendererConfig | RendererConfig[];
  resources?: string | string[];
  builder?: CliOptions;
}

class Rosectron {
  cwd: string;

  config: Config;

  packageJson: PackageJson;
  tsConfig: TsConfig;

  main: Main;
  preloads = new Map<string, Preload>();
  renderers = new Map<string, Renderer>();

  logger: RosectronLogger;

  env: Record<string, string> = {};

  private readonly priorityConfig: Config;

  get root() {
    if ( this.config.mode === "production" ) {
      return path.join(this.cwd, "app");
    }

    return this.cwd;
  }

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
      resources: "resources",
      builder: {
        config: {},
      },
    };
  }

  init = async (cwd?: string) => {
    this.cwd = cwd ?? process.cwd();

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

    const userConfig = await loadConfig(this.cwd, this.config);
    this.config = deepMerge(this.defaultConfig, userConfig, this.priorityConfig);

    this.packageJson = loadPackageJson(this.cwd);
    this.tsConfig = loadTsConfig(this.cwd);

    this.main = new Main(this, this.config.main);

    try {
      this.main.init();
    } catch ( error ) {
      this.logger.error("Failed to initialize main process");
      this.main.logger.error(error);
      process.exit(1);
    }

    if ( this.config.preload !== undefined ) {
      const preloads = Array.isArray(this.config.preload) ? this.config.preload : [this.config.preload];

      for ( const preloadConfig of preloads ) {
        if ( typeof (preloadConfig.id as unknown) !== "string" ) {
          throw Error("Preload id must be a string");
        }

        if ( this.preloads.has(preloadConfig.id) ) {
          throw Error(`Preload with id "${preloadConfig.id}" already exists`);
        }

        const preload = new Preload(this, preloadConfig);

        this.preloads.set(preloadConfig.id, preload);

        try {
          preload.init();
        } catch ( error ) {
          this.logger.error("Failed to initialize preload process");
          preload.logger.error(error);
          process.exit(1);
        }
      }
    }

    if ( this.config.renderer !== undefined ) {
      const renderers = Array.isArray(this.config.renderer) ? this.config.renderer : [this.config.renderer];

      for ( const rendererConfig of renderers ) {
        if ( typeof (rendererConfig.id as unknown) !== "string" ) {
          throw Error("Renderer id must be a string");
        }

        if ( this.renderers.has(rendererConfig.id) ) {
          throw Error(`Renderer with id "${rendererConfig.id}" already exists`);
        }

        const renderer = new Renderer(this, rendererConfig);

        this.renderers.set(rendererConfig.id, renderer);

        try {
          renderer.init();
        } catch ( error ) {
          this.logger.error("Failed to initialize renderer process");
          renderer.logger.error(error);
          process.exit(1);
        }
      }
    }

    this.env = loadEnv(this.cwd, this.config.mode);
  };

  run = async () => {
    this.logger.info("Running rosectron");
    this.logger.info(`Press ${this.logger.mark("q")} to quit`);
    this.logger.line();

    if ( this.config.mode === "development" ) {
      for ( const renderer of this.renderers.values() ) {
        await renderer.watch();
      }

      for ( const preload of this.preloads.values() ) {
        preload.watch();
      }

      this.main.watch();
    } else {
      for ( const renderer of this.renderers.values() ) {
        await renderer.build();
      }

      for ( const preload of this.preloads.values() ) {
        await preload.build();
      }

      await this.main.build();
    }

    return this.main.start();
  };

  pack = async () => {
    this.logger.info("Building rosectron");
    this.logger.line();

    const packageJsonPath = path.join(this.cwd, "app", "package.json");

    this.packageJson.main = "main/index.cjs";

    if ( this.main.config.pack?.mergeDependencies ) {
      if ( typeof this.main.config.pack.mergeDependencies === "boolean" ) {
        this.packageJson.dependencies = {
          ...this.packageJson.dependencies,
          ...this.main.packageJson.dependencies,
        };
      } else {
        const filter = createFilter(this.main.config.pack.mergeDependencies.include, this.main.config.pack.mergeDependencies.exclude);

        this.packageJson.dependencies = {
          ...this.packageJson.dependencies,
          ...Object.fromEntries(Object.entries(this.main.packageJson.dependencies ?? {}).filter(([key]) => filter(key))),
        };
      }
    }

    if ( this.main.config.pack?.mergeDevDependencies ) {
      if ( typeof this.main.config.pack.mergeDevDependencies === "boolean" ) {
        this.packageJson.devDependencies = {
          ...this.packageJson.devDependencies,
          ...this.main.packageJson.devDependencies,
        };
      } else {
        const filter = createFilter(this.main.config.pack.mergeDevDependencies.include, this.main.config.pack.mergeDevDependencies.exclude);

        this.packageJson.devDependencies = {
          ...this.packageJson.devDependencies,
          ...Object.fromEntries(Object.entries(this.main.packageJson.devDependencies ?? {}).filter(([key]) => filter(key))),
        };
      }
    }

    for ( const preload of this.preloads.values() ) {
      if ( preload.config.pack?.mergeDependencies ) {
        if ( typeof preload.config.pack.mergeDependencies === "boolean" ) {
          this.packageJson.dependencies = {
            ...this.packageJson.dependencies,
            ...preload.packageJson.dependencies,
          };
        } else {
          const filter = createFilter(preload.config.pack.mergeDependencies.include, preload.config.pack.mergeDependencies.exclude);

          this.packageJson.dependencies = {
            ...this.packageJson.dependencies,
            ...Object.fromEntries(Object.entries(preload.packageJson.dependencies ?? {}).filter(([key]) => filter(key))),
          };
        }
      }

      if ( preload.config.pack?.mergeDevDependencies ) {
        if ( typeof preload.config.pack.mergeDevDependencies === "boolean" ) {
          this.packageJson.devDependencies = {
            ...this.packageJson.devDependencies,
            ...preload.packageJson.devDependencies,
          };
        } else {
          const filter = createFilter(preload.config.pack.mergeDevDependencies.include, preload.config.pack.mergeDevDependencies.exclude);

          this.packageJson.devDependencies = {
            ...this.packageJson.devDependencies,
            ...Object.fromEntries(Object.entries(preload.packageJson.devDependencies ?? {}).filter(([key]) => filter(key))),
          };
        }
      }
    }

    for ( const renderer of this.renderers.values() ) {
      if ( renderer.config.pack?.mergeDependencies ) {
        if ( typeof renderer.config.pack.mergeDependencies === "boolean" ) {
          this.packageJson.dependencies = {
            ...this.packageJson.dependencies,
            ...renderer.packageJson.dependencies,
          };
        } else {
          const filter = createFilter(renderer.config.pack.mergeDependencies.include, renderer.config.pack.mergeDependencies.exclude);

          this.packageJson.dependencies = {
            ...this.packageJson.dependencies,
            ...Object.fromEntries(Object.entries(renderer.packageJson.dependencies ?? {}).filter(([key]) => filter(key))),
          };
        }
      }

      if ( renderer.config.pack?.mergeDevDependencies ) {
        if ( typeof renderer.config.pack.mergeDevDependencies === "boolean" ) {
          this.packageJson.devDependencies = {
            ...this.packageJson.devDependencies,
            ...renderer.packageJson.devDependencies,
          };
        } else {
          const filter = createFilter(renderer.config.pack.mergeDevDependencies.include, renderer.config.pack.mergeDevDependencies.exclude);

          this.packageJson.devDependencies = {
            ...this.packageJson.devDependencies,
            ...Object.fromEntries(Object.entries(renderer.packageJson.devDependencies ?? {}).filter(([key]) => filter(key))),
          };
        }
      }
    }

    if ( "electron" in (this.packageJson.dependencies ?? {}) ) {
      throw Error("Cannot have electron in dependencies, exclude electron from dependencies");
    }

    if ( !("electron" in (this.packageJson.devDependencies ?? {})) ) {
      throw Error("Couldn't find electron in devDependencies, include electron in devDependencies");
    }

    this.packageJson.scripts = {
      postinstall: "electron-builder install-app-deps",
    };

    await fs.promises.mkdir(path.join(this.cwd, "app"), {
      recursive: true,
    });

    await fs.promises.writeFile(packageJsonPath, JSON.stringify(this.packageJson, null, 2));

    for ( const renderer of this.renderers.values() ) {
      await renderer.build();
    }

    for ( const preload of this.preloads.values() ) {
      await preload.build();
    }

    await this.main.build();

    this.logger.line();
    this.logger.info("Packing rosectron");
    this.logger.line();

    const resources = (Array.isArray(this.config.resources) ? this.config.resources : [this.config.resources]);

    try {
      await build(deepMerge(this.config.builder, {
        projectDir: this.cwd,
        config: {
          directories: {
            buildResources: path.join(this.cwd, "buildResources"),
            output: path.join(this.cwd, "buildOutput", "${os} ${arch}"),
          },
          extraFiles: resources.map((resource) => ({
            from: resource,
            to: `${resource}/${resource}`,
          })),
        },
      }));

      this.logger.line();
      this.logger.info("Done");
      process.exit();
    } catch ( error ) {
      this.logger.line();
      this.logger.error("Failed to pack production package");
      this.logger.error(error);
      process.exit(1);
    }
  };
}

const defineRosectron = (config: Omit<Config, "mode"> | ((config: Config) => Omit<Config, "mode">)) => {
  return config;
};

export type {
  Config,
};

export {
  defineRosectron,
};

export default Rosectron;
