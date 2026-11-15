import path from "node:path";

import { nxViteTsPaths } from "@nx/vite/plugins/nx-tsconfig-paths.plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: path.resolve(__dirname, "../.."),
  plugins: [nxViteTsPaths()],
  test: {
    name: "server-rendering",
    environment: "node",
    include: ["src/printer/**/*.spec.ts", "src/font/**/*.spec.ts", "src/database/**/*.spec.ts"],
  },
});
