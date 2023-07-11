import chalk from "chalk";

import RosectronError from "~shared/error";

import util from "util";

const colors = {
  time: chalk.hex("#555657"),
  symbol: chalk.hex("#ffffff"),
  //
  info: ( ...messages: string[] ) => {
    return chalk.hex("#21be22")(messages.join(" "));
  },
  warn: ( ...messages: string[] ) => {
    return chalk.hex("#c1c41f")(messages.join(" "));
  },
  debug: ( ...messages: string[] ) => {
    return chalk.hex("#6532f3")(messages.join(" "));
  },
  error: ( ...messages: string[] ) => {
    return chalk.hex("#df1c00")(messages.join(" "));
  },
  //
  rosectron: ( ...messages: string[] ) => {
    return chalk.hex("#555657")(messages.join(" "));
  },
  main: ( ...messages: string[] ) => {
    return chalk.hex("#3a72ba")(messages.join(" "));
  },
  preload: ( ...messages: string[] ) => {
    return chalk.hex("#f5a623")(messages.join(" "));
  },
  renderer: ( ...messages: string[] ) => {
    return chalk.hex("#FFA07A")(messages.join(" "));
  },
  //
  mark: ( ...messages: string[] ) => {
    return messages.map(( message ) => {
      return chalk.bgGrey.white(` ${ message } `);
    }).join(" ");
  },
};

interface Config {
  name: string;
  color: keyof typeof colors;
  symbol: string;
  time: boolean;
  levels: {
    info: boolean;
    warn: boolean;
    error: boolean;
  };
}

class RosectronLogger {
  config: Config;

  constructor( config: Config ) {
    this.config = config;
  }

  get prefix() {
    let prefix = colors[this.config.color](this.config.name);

    if ( this.config.time ) {
      const time = new Date().toLocaleTimeString("en-US", {
        hour12: false,
        hour: "numeric",
        minute: "numeric",
        second: "numeric",
      });

      prefix = `[${ colors.time(time) }] ${ prefix }`;
    }

    if ( this.config.symbol ) {
      prefix = `${ colors.symbol(this.config.symbol) } ${ prefix }`;
    }

    return prefix;
  }

  //

  logout( ...message: string[] ) {
    return console.info(this.prefix, ":", ...message);
  }

  logerr( ...message: string[] ) {
    return console.error(this.prefix, ":", colors.error(...message));
  }

  info = ( ...messages: any[] ) => {
    return console.info(this.prefix, `[${ colors.info("info") }] :`, ...messages);
  };

  warn( ...messages: any[] ) {
    return console.warn(this.prefix, `[${ colors.warn("warn") }] :`, ...messages);
  }

  debug = ( ...messages: any[] ) => {
    return console.debug(this.prefix, `[${ colors.debug("debug") }] :`, colors.debug(...messages));
  };

  error( error: unknown ) {
    let message: string;

    if ( error instanceof Error ) {
      let rosectronError: RosectronError;

      if ( error instanceof RosectronError ) {
        rosectronError = error;
      } else {
        rosectronError = RosectronError.from(error);
      }

      message = rosectronError.formatted();
    } else if ( typeof error === "string" ) {
      message = error;
    } else {
      message = util.inspect(error, {
        colors: true,
        depth: 5,
      });
    }

    return console.error(this.prefix, `[${ colors.error("error") }] :`, message);
  }

  mark( ...messages: any ) {
    return colors.mark(...messages);
  }

  line() {
    return console.log();
  }

  timer() {
    const start = Date.now();

    return {
      end: () => {
        return Date.now() - start;
      },
    };
  }
}

export {
  colors,
};

export default RosectronLogger;