const mode = process.env.NODE_ENV;

const rootDir = process.env.ROOT_DIR;
const mainDir = process.env.MAIN_DIR;
const preloadDir = process.env.PRELOAD_DIR;
const rendererDir = process.env.RENDERER_DIR;

const resolveRoot = (...path: string[]) => {
  return `${ rootDir }/${ path.join("/") }`;
};

const resolveMain = (...path: string[]) => {
  return `${ mainDir }/${ path.join("/") }`;
};

const resolvePreload = (...path: string[]) => {
  return `${ preloadDir }/${ path.join("/") }`;
};

const resolveRenderer = (...path: string[]) => {
  if ( mode === "development" ) {
    return `${ process.env.RENDERER_URL }${ path.join("/") }`;
  }

  return `${ rendererDir }/${ path.join("/") }`;
};

export {
  rootDir,
  mainDir,
  preloadDir,
  rendererDir,
  //
  resolveRoot,
  resolveMain,
  resolvePreload,
  resolveRenderer,
};