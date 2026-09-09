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
  const types = spawnSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit'], {
    cwd: join(root, 'frontend'), stdio: 'inherit', timeout: 180000,
  });
  if (types.status !== 0) process.exit(types.status ?? 1);
  const tests = await discoverTests(root);
  if (!tests.length) {
    console.error("FAIL: no frontend tests discovered");
    process.exitCode = 1;
  } else {
    const result = spawnSync(process.execPath, ["--import", "tsx", "--test", ...tests], {
      cwd: join(root, 'frontend'), stdio: "inherit", timeout: 180000,
    });
    process.exitCode = result.status ?? 1;
    if (process.exitCode === 0) {
      const react = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run'], {
        cwd: join(root, 'frontend'), stdio: 'inherit', timeout: 180000,
      });
      process.exitCode = react.status ?? 1;
    }
  }
}
