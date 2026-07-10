import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    env: {
      DATABASE_URL: "file:./test.db",
      JWT_SECRET: "test-secret",
    },
    setupFiles: ["./src/__tests__/setup.ts"],
    fileParallelism: false,
  },
});
