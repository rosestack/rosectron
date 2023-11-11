import { mainDir, preloads, renderers } from "rosectron/paths/helper";

import { isDev } from "rosectron/utils";

const printPaths = () => {
  return console.log({
    mainDir,
    preloads,
    renderers,
  });
};

const resolveMain = (...paths: string[]) => {
  if ( paths.length ) {
    return `${mainDir}/${paths.join("/")}`;
  }

  return mainDir;
};

const resolvePreload = (id: string, ...paths: string[]) => {
  const preloadDir = preloads[id];

  if ( !preloadDir ) {
    throw Error(`Could not find preload directory for ${id}`);
  }

  if ( paths.length ) {
    return `${preloadDir}/${paths.join("/")}`;

  }

  return preloadDir;
};

const resolveRenderer = (id: string, ...paths: string[]) => {
  const renderer = renderers[id];

  if ( !renderer ) {
    throw Error(`Could not find renderer for ${id}`);
  }

  const rendererDir = isDev ? renderer.url : renderer.dir;

  if ( paths.length ) {
    return `${rendererDir}/${paths.join("/")}`;
  }

  return rendererDir;
};

export {
  printPaths,
  //
  resolveMain,
  resolvePreload,
  resolveRenderer,
};