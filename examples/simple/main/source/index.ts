import { app, BrowserWindow } from "electron";

import { initialize, enable } from "@electron/remote/main";

import { printPaths, resolvePreload, resolveRenderer } from "rosectron/paths";

import { isDev } from "rosectron/utils";
import * as path from "path";

let primaryWindow: BrowserWindow;
let secondaryWindow: BrowserWindow;

printPaths();

app.on("ready", async () => {
  initialize();

  primaryWindow = new BrowserWindow({
    webPreferences: {
      webviewTag: true,
      preload: path.resolve(__dirname, resolvePreload("primary", "index.js")),
    },
  });

  enable(primaryWindow.webContents);

  console.log(resolveRenderer("primary", "index.html"));

  if ( isDev ) {
    await primaryWindow.loadURL(resolveRenderer("primary", "index.html"));
  } else {
    await primaryWindow.loadFile(path.resolve(__dirname, resolveRenderer("secondary", "index.html")));
  }

  secondaryWindow = new BrowserWindow({
    webPreferences: {
      webviewTag: true,
      preload: path.resolve(__dirname, resolvePreload("secondary", "index.js")),
    },
  });

  enable(secondaryWindow.webContents);

  if ( isDev ) {
    await secondaryWindow.loadURL(resolveRenderer("secondary", "index.html"));
  } else {
    await secondaryWindow.loadFile(path.resolve(__dirname, resolveRenderer("secondary", "index.html")));
  }
});