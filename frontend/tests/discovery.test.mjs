import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import test from "node:test";
import { discoverTests } from "../../scripts/check_frontend.mjs";

test("frontend runner discovers member tests as well as shell tests", async () => {
  const root = await mkdtemp(join(tmpdir(), "t5-discovery-"));
  try {
    for (const path of ["frontend/tests", "frontend/src/modules/resume", "tests/jobs"]) {
      await mkdir(join(root, path), { recursive: true });
      await writeFile(join(root, path, "module.test.mjs"), "");
    }
    await writeFile(join(root, "tests/jobs/not-a-test.js"), "");
    const paths = (await discoverTests(root)).map((path) => relative(root, path).replaceAll("\\", "/"));
    assert.deepEqual(paths, ["frontend/src/modules/resume/module.test.mjs", "frontend/tests/module.test.mjs", "tests/jobs/module.test.mjs"]);
  } finally { await rm(root, { recursive: true, force: true }); }
});
