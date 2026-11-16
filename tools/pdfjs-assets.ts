import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import type { Plugin } from "vite";

const require = createRequire(import.meta.url);
const root = path.dirname(require.resolve("pdfjs-dist/package.json"));
const folders = ["cmaps", "standard_fonts", "wasm"];

/** Keep PDF.js ancillary resources local in development and the portable build. */
export function pdfjsAssets(): Plugin {
  return {
    name: "offline-pdfjs-assets",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = /^\/pdfjs\/(cmaps|standard_fonts|wasm)\/([\w.-]+)$/.exec(
          request.url?.split("?")[0] ?? "",
        );
        if (!match) return next();
        try {
          const content = readFileSync(path.join(root, match[1], match[2]));
          response.setHeader(
            "Content-Type",
            match[2].endsWith(".wasm") ? "application/wasm" : "application/octet-stream",
          );
          response.end(content);
        } catch {
          response.statusCode = 404;
          response.end();
        }
      });
    },
    generateBundle() {
      for (const folder of folders) {
        for (const filename of readdirSync(path.join(root, folder))) {
          this.emitFile({
            type: "asset",
            fileName: `pdfjs/${folder}/${filename}`,
            source: readFileSync(path.join(root, folder, filename)),
          });
        }
      }
      this.emitFile({
        type: "asset",
        fileName: "pdfjs/LICENSE",
        source: readFileSync(path.join(root, "LICENSE")),
      });
    },
  };
}
