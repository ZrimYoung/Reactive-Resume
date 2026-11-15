const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function verifyPackage(context) {
  const resources =
    process.platform === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources",
        )
      : path.join(context.appOutDir, "resources");
  const serverEntry = path.join(
    resources,
    "app.asar.unpacked",
    "dist",
    "apps",
    "server",
    "main.js",
  );
  const required = [
    serverEntry,
    path.join(resources, "app.asar.unpacked", "dist", "apps", "client", "index.html"),
    path.join(resources, "app.asar.unpacked", "dist", "apps", "artboard", "index.html"),
    path.join(resources, ".prisma", "client", "index.js"),
    path.join(resources, "puppeteer", "browser.json"),
  ];
  if (process.platform === "win32")
    required.push(path.join(resources, ".prisma", "client", "query_engine-windows.dll.node"));
  for (const file of required) {
    if (!fs.existsSync(file)) throw new Error(`Packaged offline runtime is missing: ${file}`);
  }
  for (const privatePath of ["storage", "prisma/local-resume.db"]) {
    if (fs.existsSync(path.join(resources, privatePath)))
      throw new Error(`A private data path was included in the package: ${privatePath}`);
  }
  const browserRoot = path.join(resources, "puppeteer");
  const browserManifest = JSON.parse(
    fs.readFileSync(path.join(browserRoot, "browser.json"), "utf8"),
  );
  const browserPath = path.resolve(browserRoot, browserManifest.executablePath);
  if (!browserPath.startsWith(`${browserRoot}${path.sep}`) || !fs.existsSync(browserPath)) {
    throw new Error("Packaged browser manifest does not resolve to an included Chrome executable.");
  }

  // Resolve every backend external using the shipped Electron, with no access to the developer's node_modules.
  const dependencies = [
    ...new Set(
      [...fs.readFileSync(serverEntry, "utf8").matchAll(/require\(["']([^"']+)["']\)/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  const executable =
    process.platform === "win32"
      ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`)
      : process.platform === "darwin"
        ? path.join(
            context.appOutDir,
            `${context.packager.appInfo.productFilename}.app`,
            "Contents",
            "MacOS",
            context.packager.appInfo.productFilename,
          )
        : path.join(context.appOutDir, context.packager.executableName);
  const check = `
    const Module = require('node:module');
    const path = require('node:path');
    const packageRoot = ${JSON.stringify(path.resolve(context.appOutDir))};
    const resolve = Module._resolveFilename;
    Module._resolveFilename = function (...args) {
      const resolved = resolve.apply(this, args);
      if (!Module.isBuiltin(resolved)) {
        const relative = path.relative(packageRoot, resolved);
        if (relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
          throw new Error('A packaged dependency escaped into the development machine: ' + resolved);
        }
      }
      return resolved;
    };
    const req = Module.createRequire(${JSON.stringify(serverEntry)});
    for (const name of ${JSON.stringify(dependencies)}) req(name);
    const { PrismaClient } = req('@prisma/client');
    const fs = require('node:fs');
    for (const filename of ['electron.js', 'desktop-runtime.js', 'preload.js', 'loading.html']) {
      if (!fs.existsSync(path.join(${JSON.stringify(resources)}, 'app.asar', filename))) {
        throw new Error('Packaged desktop entry file is missing: ' + filename);
      }
    }
    const temp = fs.mkdtempSync(path.join(require('node:os').tmpdir(), 'rr-package-check-'));
    const database = path.join(temp, 'runtime.db');
    const prisma = new PrismaClient({ datasourceUrl: 'file:' + database.split(path.sep).join('/') });
    (async () => {
      try {
        await prisma.$queryRawUnsafe('SELECT 1');
        console.log('Packaged backend dependencies verified');
      } finally {
        await prisma.$disconnect();
        if (fs.existsSync(database)) fs.unlinkSync(database);
        try { fs.rmdirSync(temp); } catch {}
      }
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `;
  const result = spawnSync(executable, ["--eval", check], {
    cwd: context.appOutDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_PATH: [
        resources,
        path.join(resources, "app.asar.unpacked", "node_modules"),
        path.join(resources, "app.asar", "node_modules"),
      ].join(path.delimiter),
    },
    encoding: "utf8",
    timeout: 45_000,
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || !result.stdout.includes("Packaged backend dependencies verified")) {
    throw new Error(
      `Packaged backend dependency check failed (${result.status}):\n${result.stdout}\n${result.stderr}`,
    );
  }
  console.log(`[electron-builder] ${result.stdout.trim()}`);
}

module.exports = { verifyPackage };
