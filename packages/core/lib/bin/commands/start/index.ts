import { Command } from "commander";

import Rosectron from "~/rosectron";

const start = new Command("start");

start.description("Run rosectron in production mode");

start.action(async () => {
  // @ts-ignore
  const rosectron = new Rosectron({
    mode: "production",
  });

  try {
    await rosectron.init();
    await rosectron.run();
  } catch ( error ) {
    rosectron.logger.error(error);
    process.exit(1);
  }
});

export default start;