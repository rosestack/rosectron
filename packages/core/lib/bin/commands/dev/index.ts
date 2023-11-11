import { Command } from "commander";

import Rosectron from "~/rosectron";

const dev = new Command("dev");

dev.description("Run rosectron in development mode");

dev.action(async () => {
  // @ts-ignore
  const rosectron = new Rosectron({
    mode: "development",
  });

  try {
    await rosectron.init();
    await rosectron.run();
  } catch ( error ) {
    rosectron.logger.error(error);
    process.exit(1);
  }
});

export default dev;