import type Rosectron from "~/rosectron";

import path from "path";

import fs from "fs";

const allowTypes = [
  "logo.png",
  "logo.jpg",
];

class Icon {
  rosectron: Rosectron;

  constructor(rosectron: Rosectron) {
    this.rosectron = rosectron;
  }

  resolveInput = (input?: string) => {
    if ( input ) {
      if ( path.isAbsolute(input) ) {
        if ( fs.existsSync(input) ) {
          return input;
        }

        throw new Error(`File ${ input } does not exist`);
      }

      const pathFromRoot = path.join(this.rosectron.root, input);

      if ( fs.existsSync(pathFromRoot) ) {
        return pathFromRoot;
      }
    }

    if ( !this.rosectron.config.resources ) {
      return;
    }

    const resources = Array.isArray(this.rosectron.config.resources) ? this.rosectron.config.resources : [this.rosectron.config.resources];

    for ( const resource of resources ) {
      for ( const allowType of allowTypes ) {
        const pathFromResource = path.join(this.rosectron.root, resource, allowType);

        if ( fs.existsSync(pathFromResource) ) {
          return pathFromResource;
        }
      }
    }
  };

  init = (input?: string) => {
    this.rosectron.logger.info("Rosectron Icon Generator");

    input = this.resolveInput(input);

    if ( !input ) {
      throw Error("Couldn't find input to generate icon from");
    }

    this.rosectron.logger.info(`input: ${ input }`);
    this.rosectron.logger.line();
  };
}

export default Icon;