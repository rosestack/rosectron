import Rosectron from "~/rosectron";

import RosectronLogger from "~shared/logger";

import { PackageJson, TsConfig } from "~shared/types";

import path from "path";
import fs from "fs";

enum ElectronType {
  "MAIN" = "main",
  "Preload" = "preload",
  "Renderer" = "renderer",
}

interface ElectronConfig {
  /**
   * package name or location relative from monorepo root
   */
  package: string;
}

abstract class Electron {
  type: ElectronType;

  abstract config: ElectronConfig;

  packageJson: PackageJson;
  tsConfig: TsConfig;

  logger: RosectronLogger;

  env: Record<string, string> = {};

  abstract rosectron: Rosectron;

  get cwd() {
    const relativePath = path.join(this.rosectron.root, this.config.package);

    if ( fs.existsSync(relativePath) ) {
      return relativePath;
    }

    const resolvedPath = require.resolve(path.join(this.config.package!, "package.json"), {
      paths: [this.rosectron.root],
    });

    if ( fs.existsSync(resolvedPath) ) {
      return path.dirname(resolvedPath);
    }

    throw new Error("package not found");
  }

  abstract get dir(): string;

  protected constructor(type: ElectronType) {
    this.type = type;
  }

  protected getEnv = (processEnv = true) => {
    const env: Record<string, string> = {
      ...this.rosectron.env,
      ...this.env,
    };

    Reflect.set(env, "NODE_ENV", this.rosectron.config.mode);

    if ( processEnv ) {
      return Object.fromEntries(Object.entries(env).map(([key, value]) => {
        return [`process.env.${key}`, JSON.stringify(value)];
      }));
    }

    return env;
  };
}

export type {
  ElectronConfig,
};

export {
  ElectronType,
};

export default Electron;