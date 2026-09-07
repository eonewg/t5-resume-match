// Run both the shared frontend tests and member-owned *.test.mjs tests.
import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export async function discoverTests(root) {
  const tests = [];
  for (const folder of ["frontend/tests", "frontend/src/modules", "tests"]) {
    const directory = join(root, folder);
    let paths;
    try { paths = await readdir(directory, { recursive: true }); }
    catch (error) { if (error.code === "ENOENT") continue; throw error; }
    tests.push(...paths.filter((path) => path.endsWith(".test.mjs")).map((path) => join(directory, path)));
  }
  return tests.sort();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  const tests = await discoverTests(root);
  if (!tests.length) {
    console.error("FAIL: no frontend tests discovered");
    process.exitCode = 1;
  } else {
    const result = spawnSync(process.execPath, ["--test", ...tests], {
      cwd: root, stdio: "inherit", timeout: 180000,
    });
    process.exitCode = result.status ?? 1;
  }
}
