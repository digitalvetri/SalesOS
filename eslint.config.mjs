// Flat ESLint config. Spec §14: @prisma/client may only be imported from src/server/repo.
import nextConfig from "eslint-config-next";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import tsConfig from "eslint-config-next/typescript";

const config = [
  { ignores: [".next/**", "node_modules/**", "tests/unit/eslint-fixtures/**", "coverage/**", "docs/evidence/**"] },
  ...nextConfig,
  ...coreWebVitals,
  ...tsConfig,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@prisma/client", "@prisma/client/*"],
              message:
                "Import Prisma only from src/server/repo/client.ts (spec §14, §8).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/server/repo/**/*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
  // Scripts, prisma side-tools, and integration tests may import @prisma/client
  // directly — tests manage their own tenant lifecycle, scripts bootstrap the DB.
  {
    files: ["scripts/**/*.{mjs,ts}", "prisma/**/*.ts", "tests/integration/**/*.ts"],
    rules: { "no-restricted-imports": "off", "@typescript-eslint/no-explicit-any": "off" },
  },
];

export default config;
