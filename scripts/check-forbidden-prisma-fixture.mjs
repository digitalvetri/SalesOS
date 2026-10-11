// Confirms the no-restricted-imports rule rejects `import {} from "@prisma/client"`
// anywhere outside src/server/repo. The fixture lives under tests/unit/eslint-fixtures/
// so it is excluded from normal lint runs; we lint it here explicitly with ignore disabled.
import { ESLint } from "eslint";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), "..");
const fixture = path.join(root, "tests/unit/eslint-fixtures/forbidden-prisma-import.ts");

const eslint = new ESLint({ cwd: root, ignore: false });
const results = await eslint.lintFiles([fixture]);

const errors = results.flatMap((r) =>
  r.messages.filter((m) => m.ruleId === "no-restricted-imports" && m.severity === 2),
);

if (errors.length === 0) {
  console.error("FAIL: forbidden-prisma-import fixture did not trigger no-restricted-imports.");
  for (const r of results) {
    for (const m of r.messages) {
      console.error(`  ${r.filePath}: ${m.ruleId ?? "<no rule>"}: ${m.message}`);
    }
  }
  process.exit(1);
}

console.log(
  `OK: forbidden-prisma-import correctly rejected (${errors.length} violation${
    errors.length === 1 ? "" : "s"
  }).`,
);
