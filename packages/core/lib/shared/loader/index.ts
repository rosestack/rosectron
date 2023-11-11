import dotenv from "dotenv";

import { rollup } from "rollup";

import jsonPlugin from "@rollup/plugin-json";

import ts from "typescript";

import type { Config } from "~/rosectron";

import type { PackageJson, TsConfig } from "~shared/types";

import { packageJsonFile, tsConfigFile, configFile } from "~shared/constants";

import RosepackError from "~shared/error";

import swcPlugin from "./plugins/swc";

import path from "path";
import url from "url";
import fs from "fs";

const loadConfig = async (root: string, config: Config): Promise<Config> => {
  const configFilePath = path.join(root, configFile);

  if ( !fs.existsSync(configFilePath) ) {
    throw new RosepackError(`${ configFile } is not exists`);
  }

  let transpiledConfigFile: string | undefined;

  try {
    const build = await rollup({
      input: configFilePath,
      plugins: [
        // @ts-ignore
        jsonPlugin(),
        swcPlugin(),
      ],
      onwarn: () => {
        return null;
      },
      external: (id: string) => {
        if ( id.startsWith(".") ) {
          return false;
        }

        return !path.isAbsolute(id);
      },
    });

    const output = await build.write({
      dir: root,
      entryFileNames: "[name].[hash].mjs",
      chunkFileNames: "[name].[hash].mjs",
      freeze: false,
      sourcemap: false,
      exports: "named",
      format: "esm",
    });

    await build.close();

    transpiledConfigFile = path.join(root, output.output[0].fileName);

    const file = url.pathToFileURL(transpiledConfigFile);

    file.hash = Date.now().toString();

    const configLoaded = await import( file.href );

    const mod = configLoaded.rosectron || configLoaded.default;

    if ( !mod ) {
      throw new RosepackError("no default export founds");
    }

    if ( typeof mod === "function" ) {
      return await mod(config);
    }

    if ( typeof mod !== "object" ) {
      return mod;
    }

    if ( !mod ) {
      throw new RosepackError(`invalid default export, receved ${ typeof mod }`);
    }

    return mod;
  } catch ( error: unknown ) {
    throw RosepackError.from(error);
  } finally {
    if ( transpiledConfigFile ) {
      fs.unlinkSync(transpiledConfigFile);
    }
  }
};

const loadPackageJson = (root: string): PackageJson => {
  const filepath = path.join(root, packageJsonFile);

  if ( !fs.existsSync(filepath) ) {
    throw new RosepackError(`${ packageJsonFile } is not exists`);
  }

  try {
    const stringifyJson = fs.readFileSync(filepath, "utf-8");

    return JSON.parse(stringifyJson);
  } catch ( error ) {
    if ( error instanceof RosepackError ) {
      throw error;
    }

    throw RosepackError.from(`failed to parse ${ packageJsonFile }, cause: ${ error }`);
  }
};

const loadTsConfig = (root: string): TsConfig => {
  const filepath = path.join(root, tsConfigFile);

  if ( !fs.existsSync(filepath) ) {
    throw new RosepackError(`${ tsConfigFile } is not exists`);
  }

  try {
    const { config, error } = ts.readConfigFile(filepath, ts.sys.readFile);

    if ( error ) {
      throw new RosepackError(ts.formatDiagnostic(error, {
        getCanonicalFileName: (fileName) => {
          return fileName;
        },
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => {
          return ts.sys.newLine;
        },
      }));
    }

    const parsedTsFile = ts.parseJsonConfigFileContent(config, ts.sys, root);

    return {
      compilerOptions: parsedTsFile.options,
      include: parsedTsFile.raw.include || [],
      exclude: parsedTsFile.raw.exclude || [],
    };
  } catch ( error ) {
    if ( error instanceof RosepackError ) {
      throw error;
    }

    throw RosepackError.from(`failed to parse ${ tsConfigFile }, cause: ${ error }`);
  }
};

const loadEnv = (root: string, mode: Config["mode"]): Record<string, string> => {
  try {
    const dotEnvFiles = [
      ".env",
      ".env.local",
    ];

    if ( mode === "development" ) {
      dotEnvFiles.push(".env.dev", ".env.dev.local");
      dotEnvFiles.push(".env.development", ".env.development.local");
    } else {
      dotEnvFiles.push(".env.prod", ".env.prod.local");
      dotEnvFiles.push(".env.production", ".env.production.local");
    }

    const env: Record<string, string> = {};

    for ( const dotEnvFile of dotEnvFiles ) {
      const dotEnvFilePath = path.join(root, dotEnvFile);

      if ( fs.existsSync(dotEnvFilePath) ) {
        try {
          const content = fs.readFileSync(dotEnvFilePath, "utf-8");
          const parseEnv = dotenv.parse(content);

          if ( !parseEnv ) {
            throw new Error(`Failed to parse ${ dotEnvFilePath }`);
          }

          Object.entries(parseEnv).forEach(([ key, value ]) => {
            Reflect.set(env, key, value);
          });
        } catch ( error ) {
          throw RosepackError.from(`failed to load env, cause: ${ error }`);
        }
      }
    }

    return env;
  } catch ( error ) {
    throw RosepackError.from(`failed to load env, cause: ${ error }`);
  }
};

export {
  loadConfig,
  loadPackageJson,
  loadTsConfig,
  loadEnv,
};