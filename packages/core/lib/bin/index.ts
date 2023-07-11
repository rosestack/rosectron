#!/usr/bin/env node

import { Command } from "commander";

import dev from "./commands/dev";
import preview from "./commands/preview";
import start from "./commands/start";

import pack from "./commands/pack";

import readline from "readline";

const commander = new Command();

commander.option("-d, --debug", "output extra debugging");
commander.on("option:debug", () => {
  process.env.DEBUG = "true";
});

commander.name("Rosectron");

commander.addCommand(dev);
commander.addCommand(preview);
commander.addCommand(start);

commander.addCommand(pack);

commander.parse();

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);
process.stdin.setEncoding("utf8");
process.stdin.on("data", ( key ) => {
  if ( Buffer.from(key).toString() === "\x03" || Buffer.from(key).toString() === "q" ) {
    process.stdin.setRawMode(false);
    process.exit();
  }
});