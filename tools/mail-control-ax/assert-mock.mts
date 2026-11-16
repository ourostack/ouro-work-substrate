// The X-ray's guard for the mail-control door: it passes only when MAIL_CONTROL_URL is a loopback mail-control
// instance on the made-up test domain, so the X-ray never calls the production service.
const FIXTURE_DOMAIN = "ouro.example.test";
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);

const address = process.env["MAIL_CONTROL_URL"];
if (!address) fail("MAIL_CONTROL_URL is not set. Fix: pass --env MAIL_CONTROL_URL=http://127.0.0.1:<port>.");
const url = new URL(address);
if (!LOOPBACK.has(url.hostname)) fail(`${url.hostname} is not loopback. Fix: point MAIL_CONTROL_URL at 127.0.0.1.`);

const response = await fetch(new URL("/health", url), { redirect: "manual", signal: AbortSignal.timeout(5000) }).catch(() => null);
const health = response?.ok ? ((await response.json()) as { service?: unknown; domain?: unknown }) : null;
if (health?.service !== "ouro-mail-control" || health.domain !== FIXTURE_DOMAIN) {
  fail(`${address} is not the test mail-control on ${FIXTURE_DOMAIN}. Fix: start apps/mail-control against a local --store and --registry-domain ${FIXTURE_DOMAIN}.`);
}
process.stdout.write(`mock proven: ${address} is the local test mail-control on ${FIXTURE_DOMAIN}\n`);

function fail(message: string): never {
  process.stderr.write(`assert-mock: ${message}\n`);
  process.exit(1);
}
