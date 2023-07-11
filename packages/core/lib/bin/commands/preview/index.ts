import { Command } from "commander";

import Rosectron from "~/rosectron";

const preview = new Command("preview");

preview.description("Run rosectron in preview mode");

preview.action(async () => {
  const rosectron = new Rosectron({
    mode: "preview",
  });

  try {
    await rosectron.init();
    await rosectron.run();
  } catch ( error ) {
    rosectron.logger.error(error);
  }
});

export default preview;