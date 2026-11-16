import { quietPipes, runCli } from "../../lib/ouro-ui/registry/ouro/ax/cli.ts";
import { mailControlCli } from "./cli.mts";

quietPipes(process);
const code = await runCli(mailControlCli, process.argv.slice(2), { stdout: process.stdout, stderr: process.stderr, stdin: process.stdin });
process.exitCode = code;
