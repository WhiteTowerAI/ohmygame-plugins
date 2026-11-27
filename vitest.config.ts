import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/taptap/**/*.test.ts", "test/launch-check/**/*.test.ts", "test/ship-ladder/**/*.test.ts", "test/minigame-skills/**/*.test.ts"],
    // A plugin page imports the bridge the app serves it; tests mock it.
    alias: { "/_ohmygame/plugin-ui.js": fileURLToPath(new URL("test/plugin-ui.ts", import.meta.url)) },
  },
});
