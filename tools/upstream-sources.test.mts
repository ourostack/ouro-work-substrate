import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { test } from "node:test"
import assert from "node:assert/strict"

const root = new URL("../", import.meta.url)

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(new URL(path, root))).digest("hex")
}

const lock = JSON.parse(readFileSync(new URL("upstream-sources.lock.json", root), "utf-8")) as {
  sources: Array<{ id: string; files: Array<{ generatedPath: string; sha256: string }> }>
}

test("every vendored upstream file matches its pinned sha256", () => {
  for (const source of lock.sources) {
    for (const file of source.files) {
      assert.equal(sha256(file.generatedPath), file.sha256, `${source.id}: ${file.generatedPath} changed. Fix: copy it again from the pinned tag and update its sha256.`)
    }
  }
})

test("the vendored actions generator is the one core's release manifest names", () => {
  const manifest = JSON.parse(readFileSync(new URL("tools/ouro-actions/dist-manifest.json", root), "utf-8")) as { files: Record<string, string> }
  assert.equal(sha256("tools/ouro-actions/ouro-actions.mts"), manifest.files["dist/actions/ouro-actions.mts"])
  assert.equal(sha256("tools/ouro-actions/actions.claims.json"), manifest.files["dist/ax/actions.claims.json"])
})
