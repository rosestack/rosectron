import { Command } from "commander";

import Rosectron from "~/rosectron";

const pack = new Command("pack");

pack.description("Pack your rosectron app");

pack.option("-p, --publish", "Publish");

interface PackOptions {
  publish?: boolean;
}

pack.action(async (options: PackOptions) => {
  // @ts-ignore
  const rosectron = new Rosectron({
    mode: "production",
    builder: {
      publish: options.publish ? "always" : "never",
    },
  });

  try {
    await rosectron.init();
    await rosectron.pack();
  } catch ( error ) {
    rosectron.logger.error(error);
    process.exit(1);
  }
});

export type {
  PackOptions,
};

export default pack;