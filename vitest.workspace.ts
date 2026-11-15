import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    extends: "./apps/server/vite.config.ts",
    root: "./apps/server",
    test: { name: "server" },
  },
  {
    extends: "./libs/utils/vite.config.ts",
    root: "./libs/utils",
    test: { name: "utils" },
  },
  {
    extends: "./libs/ui/vite.config.ts",
    root: "./libs/ui",
    test: { name: "ui" },
  },
  {
    extends: "./apps/client/vite.config.ts",
    root: "./apps/client",
    test: { name: "client" },
  },
  {
    extends: "./apps/artboard/vite.config.ts",
    root: "./apps/artboard",
    test: {
      name: "artboard",
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  },
]);
