import { Command } from "commander";

import Rosectron from "~/rosectron";

import Icon from "~/tools/icon";

const icon = new Command("icon");

icon.description("Icon generator");

icon.argument("[inout]", "image input");

icon.action(async (input) => {
  // @ts-ignore
  const rosectron = new Rosectron({
    mode: "development",
  });

  const icon = new Icon(rosectron);

  try {
    await rosectron.init();
    icon.init(input);
  } catch ( error ) {
    rosectron.logger.error(error);
    process.exit(1);
  }
});

export default icon;