/**
 * Problems with the user's setup (DESIGN 7-6 B). Each carries the cause and the next step.
 * A program under test crashing is NOT one of these: that is a result, not an error.
 */
export class SetupError extends Error {
  constructor(
    message: string,
    /** One line telling the user what to do next. */
    readonly nextStep: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ConfigError extends SetupError {}

export class CommandNotFoundError extends SetupError {}

/** A web server of the web type did not start listening (run.type "web"). */
export class ServerStartError extends SetupError {}
