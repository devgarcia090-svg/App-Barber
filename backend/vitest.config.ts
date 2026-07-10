import { defineConfig } from "vitest/config";

// DB-backed tests run only when TEST_DATABASE_URL points at a disposable
// Postgres database (they wipe every table between tests). Pure unit tests
// always run.
const testDbUrl = process.env.TEST_DATABASE_URL;

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: testDbUrl ?? "postgresql://unset:unset@localhost:5432/unset",
      DIRECT_URL: testDbUrl ?? "postgresql://unset:unset@localhost:5432/unset",
      JWT_SECRET: "test-secret",
      ...(testDbUrl ? { TEST_DATABASE_URL: testDbUrl } : {}),
    },
    setupFiles: ["./src/__tests__/setup.ts"],
    fileParallelism: false,
  },
});
