import { Command } from "commander";

import Rosectron from "~/rosectron";

const pack = new Command("pack");

pack.description("Pack your rosectron app");

pack.action(async () => {
  const rosectron = new Rosectron({
    mode: "production",
  });

  try {
    await rosectron.init();
    await rosectron.pack();
  } catch ( error ) {
    rosectron.logger.error(error);
  }
});

export default pack;