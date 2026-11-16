const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { prepareBrowser } = require("../puppeteer/prepare");

const repoRoot = path.resolve(__dirname, "../..");

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { cwd: repoRoot, stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${cmd} ${args.join(" ")} failed (${result.status ?? result.signal}).`);
}

function checkBuildInputs() {
  const expected = [
    "electron.js",
    "desktop-runtime.js",
    "preload.js",
    "loading.html",
    "dist/apps/server/main.js",
    "dist/apps/client/index.html",
    "dist/apps/artboard/index.html",
    "dist/apps/client/pdfjs/LICENSE",
    "dist/apps/client/pdfjs/cmaps/UniGB-UCS2-H.bcmap",
    "dist/apps/client/pdfjs/standard_fonts/FoxitFixed.pfb",
    "dist/apps/client/pdfjs/wasm/openjpeg.wasm",
    "node_modules/.prisma/client/index.js",
    "node_modules/.prisma/client/default.js",
  ];
  if (process.platform === "win32")
    expected.push("node_modules/.prisma/client/query_engine-windows.dll.node");
  for (const file of expected) {
    if (!fs.existsSync(path.join(repoRoot, file)))
      throw new Error(`Required offline build input is missing: ${file}`);
  }
  if (
    !fs
      .readdirSync(path.join(repoRoot, "dist/apps/client/assets"))
      .some((name) => /^pdf\.worker\.min-.*\.mjs$/.test(name))
  )
    throw new Error("The local PDF reader worker is missing from the client build.");
}

async function prepare({ build = true, offline = false } = {}) {
  process.chdir(repoRoot);
  await prepareBrowser({ offline });
  if (build) {
    const socketDir = path.join(os.tmpdir(), "rr-nx");
    fs.mkdirSync(socketDir, { recursive: true });
    const env = {
      ...process.env,
      NX_DAEMON: "false",
      NX_NO_CLOUD: "true",
      NX_SOCKET_DIR: socketDir,
    };
    // npm_execpath is the package manager's JS entry point, avoiding Windows .cmd spawning and shell quoting.
    if (process.env.npm_execpath)
      run(process.execPath, [process.env.npm_execpath, "run", "build"], { env });
    else
      run(
        process.platform === "win32" ? "cmd.exe" : "sh",
        process.platform === "win32" ? ["/d", "/s", "/c", "pnpm build"] : ["-c", "pnpm build"],
        { env },
      );
  }
  checkBuildInputs();
  console.log(
    "[prepack] Offline production assets, generated Prisma client, and browser are ready.",
  );
}

module.exports = { checkBuildInputs, prepare };
if (require.main === module) {
  prepare({
    build: process.argv[2] !== "check",
    offline: process.argv.includes("--offline"),
  }).catch((error) => {
    console.error("[prepack]", error);
    process.exitCode = 1;
  });
}
