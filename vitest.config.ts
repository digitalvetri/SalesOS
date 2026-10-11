import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/unit/eslint-fixtures/**"],
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/server/domain/**/*.ts"],
      // Spec §16: "100% line coverage on src/server/domain".
      // Keep branches/statements as high-signal advisories but don't gate on them.
      thresholds: {
        lines: 100,
        functions: 100,
      },
    },
    testTimeout: 60_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
