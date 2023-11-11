class RosectronError extends Error {
  formatted() {
    const debug = process.env.DEBUG;

    if ( debug ) {
      if ( this.stack ) {
        this.stack = this.stack?.replace(/^Error: /, "");
      } else {
        this.stack = this.message;
      }
    }

    return debug ? this.stack as string : this.message;
  }

  static from = ( error: any ) => {
    if ( error instanceof RosectronError ) {
      return error;
    }

    const rosepackError = new RosectronError(error);

    if ( error instanceof Error ) {
      rosepackError.message = error.message;
      rosepackError.stack = error.stack ?? error.message;
    }

    return rosepackError;
  };
}

export default RosectronError;