import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/taptap/**/*.test.ts", "test/game-tests/**/*.test.ts"],
    // A plugin page imports the bridge the app serves it.
    alias: { "/_ohmygame/plugin-ui.js": fileURLToPath(new URL("test/game-tests/plugin-ui.ts", import.meta.url)) },
  },
});
