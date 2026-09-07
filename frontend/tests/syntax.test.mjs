import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../src/", import.meta.url);
for (const path of await readdir(root, { recursive: true })) {
  if (!path.endsWith(".js")) continue;
  test(`syntax: ${path}`, () => {
    const result = spawnSync(process.execPath, ["--check", fileURLToPath(new URL(path.replaceAll("\\", "/"), root))], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  });
}
