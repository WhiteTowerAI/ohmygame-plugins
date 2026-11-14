import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["test/taptap/**/*.test.ts"] },
});
