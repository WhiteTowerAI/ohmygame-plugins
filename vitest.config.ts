import { fileURLToPath } from "node:url";
import { defaultServerConditions } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // App modules the tests load import its packages from source, as the app's own tests do.
  ssr: { resolve: { conditions: ["ohmygame-source", ...defaultServerConditions] } },
  test: {
    include: ["test/taptap/**/*.test.ts", "test/game-tests/**/*.test.ts"],
    // A plugin page imports the bridge the app serves it.
    alias: { "/_ohmygame/plugin-ui.js": fileURLToPath(new URL("test/game-tests/plugin-ui.ts", import.meta.url)) },
  },
});
