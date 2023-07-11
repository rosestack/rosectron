import { Command } from "commander";

import Rosectron from "~/rosectron";

const dev = new Command("dev");

dev.description("Run rosectron in development mode");

dev.action(async () => {
  const rosectron = new Rosectron({
    mode: "development",
  });

  try {
    await rosectron.init();
    await rosectron.run();
  } catch ( error ) {
    rosectron.logger.error(error);
  }
});

export default dev;