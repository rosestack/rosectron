import { Command } from "commander";

import Rosectron from "~/rosectron";

const start = new Command("start");

start.description("Run rosectron in production mode");

start.action(async () => {
  const rosectron = new Rosectron({
    mode: "production",
  });

  try {
    await rosectron.init();
    await rosectron.run();
  } catch ( error ) {
    rosectron.logger.error(error);
  }
});

export default start;