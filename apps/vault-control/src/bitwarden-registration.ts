import * as crypto from "node:crypto"

export interface VaultSetupResult {
  success: boolean
  email: string
  serverUrl: string
  error?: string
}

export interface VaultRegistrationPayload {
  name: string
  email: string
  masterPasswordHash: string
  masterPasswordHint: null
  key: string
  kdf: 0
  kdfIterations: number
  keys: {
    publicKey: string
    encryptedPrivateKey: string
  }
}

export function deriveMasterKey(password: string, email: string, iterations: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, email.toLowerCase(), iterations, 32, "sha256", (err, key) => {
      /* v8 ignore next -- core crypto callback failures are not practically inducible here. */
      if (err) reject(err)
      else resolve(key)
    })
  })
}

export function deriveMasterPasswordHash(masterKey: Buffer, password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(masterKey, password, 1, 32, "sha256", (err, hash) => {
      /* v8 ignore next -- core crypto callback failures are not practically inducible here. */
      if (err) reject(err)
      else resolve(hash.toString("base64"))
    })
  })
}

function hkdfExpandOnly(prk: Buffer, info: string, length: number): Buffer {
  const hashLen = 32
  const n = Math.ceil(length / hashLen)
  let okm = Buffer.alloc(0)
  let t = Buffer.alloc(0)
  for (let i = 1; i <= n; i += 1) {
    t = crypto.createHmac("sha256", prk)
      .update(Buffer.concat([t, Buffer.from(info, "utf8"), Buffer.from([i])]))
      .digest()
    okm = Buffer.concat([okm, t])
  }
  return okm.subarray(0, length)
}

export function deriveStretchedMasterKey(masterKey: Buffer): Buffer {
  return Buffer.concat([
    hkdfExpandOnly(masterKey, "enc", 32),
    hkdfExpandOnly(masterKey, "mac", 32),
  ])
}

function encryptWithStretchedKey(data: Buffer, stretchedKey: Buffer): string {
  const encKey = stretchedKey.subarray(0, 32)
  const macKey = stretchedKey.subarray(32, 64)
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv("aes-256-cbc", encKey, iv)
  const ct = Buffer.concat([cipher.update(data), cipher.final()])
  const mac = crypto.createHmac("sha256", macKey).update(iv).update(ct).digest()
  return `2.${iv.toString("base64")}|${ct.toString("base64")}|${mac.toString("base64")}`
}

function generateRsaKeypair(): { publicKeyB64: string; privateKeyDer: Buffer } {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  })
  return {
    publicKeyB64: (publicKey as Buffer).toString("base64"),
    privateKeyDer: privateKey as Buffer,
  }
}

const KDF_PBKDF2 = 0
const KDF_ITERATIONS = 600000
const SEND_VERIFICATION_EMAIL_PATH = "/identity/accounts/register/send-verification-email"
const REGISTER_FINISH_PATH = "/identity/accounts/register/finish"
const LEGACY_REGISTER_ACCOUNT_PATH = "/identity/accounts/register"
const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" }

export async function buildVaultRegistrationPayload(input: {
  agentName: string
  email: string
  masterPassword: string
}): Promise<VaultRegistrationPayload> {
  const masterKey = await deriveMasterKey(input.masterPassword, input.email, KDF_ITERATIONS)
  const masterPasswordHash = await deriveMasterPasswordHash(masterKey, input.masterPassword)
  const stretchedKey = deriveStretchedMasterKey(masterKey)
  const symKey = crypto.randomBytes(64)
  const protectedSymKey = encryptWithStretchedKey(symKey, stretchedKey)
  const { publicKeyB64, privateKeyDer } = generateRsaKeypair()
  const encryptedPrivateKey = encryptWithStretchedKey(privateKeyDer, symKey)
  return {
    name: input.agentName,
    email: input.email,
    masterPasswordHash,
    masterPasswordHint: null,
    key: protectedSymKey,
    kdf: KDF_PBKDF2,
    kdfIterations: KDF_ITERATIONS,
    keys: {
      publicKey: publicKeyB64,
      encryptedPrivateKey,
    },
  }
}

type RegistrationStep = { ok: true } | { ok: false; error: string }

async function readErrorDetail(res: Response): Promise<string> {
  try {
    const body = await res.json() as { message?: string }
    return body.message ?? `HTTP ${res.status} ${res.statusText}`
  } catch {
    return `HTTP ${res.status} ${res.statusText}`
  }
}

function describeRegistrationFailure(detail: string, url: string, email: string): string {
  if (/registration not allowed/i.test(detail)) {
    return `the vault server doesn't allow signups for ${email}; ask its admin to invite it (Vaultwarden admin → Invite User), then retry. (${detail} from ${url})`
  }
  return `${detail} from ${url}. Check vault server identity API.`
}

/** Vaultwarden returns the token as a JSON string when asked for JSON, or as plain text otherwise. */
async function readVerificationToken(res: Response): Promise<string> {
  const text = (await res.text()).trim()
  try {
    const parsed: unknown = JSON.parse(text)
    return typeof parsed === "string" ? parsed : ""
  } catch {
    return text
  }
}

/**
 * Current Bitwarden/Vaultwarden registration: request a verification token, then finish
 * registration with it. Servers that predate this flow (404 on send-verification-email)
 * get the legacy single-step `/identity/accounts/register`.
 */
async function registerAccount(
  fetcher: typeof fetch,
  serverUrl: string,
  payload: VaultRegistrationPayload,
): Promise<RegistrationStep> {
  const post = (url: string, body: unknown) => fetcher(url, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify(body) })
  const verifyUrl = `${serverUrl}${SEND_VERIFICATION_EMAIL_PATH}`
  const verifyRes = await post(verifyUrl, { email: payload.email, name: payload.name, receiveMarketingEmails: false })

  if (verifyRes.status === 404) {
    const legacyUrl = `${serverUrl}${LEGACY_REGISTER_ACCOUNT_PATH}`
    const legacyRes = await post(legacyUrl, payload)
    return legacyRes.ok
      ? { ok: true }
      : { ok: false, error: describeRegistrationFailure(await readErrorDetail(legacyRes), legacyUrl, payload.email) }
  }
  if (!verifyRes.ok) {
    return { ok: false, error: describeRegistrationFailure(await readErrorDetail(verifyRes), verifyUrl, payload.email) }
  }

  const token = verifyRes.status === 204 ? "" : await readVerificationToken(verifyRes)
  if (!token) {
    return {
      ok: false,
      error: `the vault server at ${serverUrl} requires email verification for new accounts and sent a link to ${payload.email}; registration can't finish unattended. Turn off signup verification or invite the account, then retry.`,
    }
  }

  const finishUrl = `${serverUrl}${REGISTER_FINISH_PATH}`
  const finishRes = await post(finishUrl, { ...payload, emailVerificationToken: token })
  return finishRes.ok
    ? { ok: true }
    : { ok: false, error: describeRegistrationFailure(await readErrorDetail(finishRes), finishUrl, payload.email) }
}

export async function createVaultAccount(input: {
  agentName: string
  serverUrl: string
  email: string
  masterPassword: string
  fetchImpl?: typeof fetch
}): Promise<VaultSetupResult> {
  const fetcher = input.fetchImpl ?? fetch
  const serverUrl = input.serverUrl.replace(/\/+$/, "")
  try {
    const payload = await buildVaultRegistrationPayload({
      agentName: input.agentName,
      email: input.email,
      masterPassword: input.masterPassword,
    })
    const step = await registerAccount(fetcher, serverUrl, payload)
    if (!step.ok) {
      return { success: false, email: input.email, serverUrl: input.serverUrl, error: step.error }
    }
    return { success: true, email: input.email, serverUrl: input.serverUrl }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      email: input.email,
      serverUrl: input.serverUrl,
      error: `cannot reach vault registration endpoint ${serverUrl}${SEND_VERIFICATION_EMAIL_PATH}: ${reason}`,
    }
  }
}
