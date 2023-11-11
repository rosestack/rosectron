import type { PluginImpl } from "rollup";

import ts from "typescript";

import { normalizePath } from "~shared/utils";

interface ResolvePluginOptions {
  compilerOptions: ts.CompilerOptions;
}

const resolvePlugin: PluginImpl<ResolvePluginOptions> = (options) => {
  const { compilerOptions } = options!;

  return {
    name: "resolve",
    enforce: "pre",
    resolveId(id, importer) {
      if ( importer === undefined ) {
        return null;
      }

      if ( id.startsWith("\0") ) {
        return null;
      }

      const moduleName = normalizePath(ts.sys.realpath?.(id)!);

      const { resolvedModule } = ts.resolveModuleName(moduleName, importer, compilerOptions, ts.sys);

      if ( !resolvedModule ) {
        return null;
      }

      if ( !resolvedModule.resolvedFileName ) {
        return null;
      }

      if ( resolvedModule.resolvedFileName.endsWith(".d.ts") ) {
        return null;
      }

      return ts.sys.realpath?.(resolvedModule.resolvedFileName);
    },
  };
};

export default resolvePlugin;