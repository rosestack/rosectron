import { mode, process } from "rosectron/utils/helper";

const isDev = mode === "development";

const isProd = mode === "production";

const isPreview = mode === "preview";

//

const isMain = process === "main";

const isPreload = process === "preload";

const isRenderer = process === "renderer";

export {
  isDev,
  isProd,
  isPreview,
  //
  isMain,
  isPreload,
  isRenderer,
};