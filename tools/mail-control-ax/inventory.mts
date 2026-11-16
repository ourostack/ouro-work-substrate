import { mailControlCli } from "./cli.mts";

// The surfaces the CLI registers, read from the CLI itself (never written by hand): the X-ray compares them with what it finds.
const inventory = { cli: mailControlCli.commands.map((command) => command.name) };
process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
