const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const puppeteer = require("puppeteer");
const browsers = require(
  require.resolve("@puppeteer/browsers", {
    paths: [path.dirname(require.resolve("puppeteer"))],
  }),
);

const repoCache = path.resolve(__dirname, "cache");

function browserDetails(cacheDir) {
  const platform = browsers.detectBrowserPlatform();
  if (!platform)
    throw new Error(`Unsupported browser platform: ${process.platform}/${process.arch}`);
  const buildId =
    puppeteer.default.configuration.chrome?.version || puppeteer.PUPPETEER_REVISIONS.chrome;
  const executablePath = browsers.computeExecutablePath({
    cacheDir,
    browser: browsers.Browser.CHROME,
    platform,
    buildId,
  });
  const installationDir = new browsers.Cache(cacheDir).installationDir(
    browsers.Browser.CHROME,
    platform,
    buildId,
  );
  return { platform, buildId, executablePath, installationDir };
}

function checkBrowserFiles(details) {
  if (!fs.existsSync(details.executablePath)) return false;
  if (process.platform === "win32") {
    const browserDir = path.dirname(details.executablePath);
    for (const file of ["chrome.dll", "icudtl.dat", "resources.pak", "locales/en-US.pak"]) {
      if (!fs.existsSync(path.join(browserDir, file))) return false;
    }
  }
  return true;
}

async function prepareBrowser({ offline = false, verify = true } = {}) {
  const details = browserDetails(repoCache);
  fs.mkdirSync(repoCache, { recursive: true });

  if (!checkBrowserFiles(details)) {
    const userCaches = [
      process.env.PUPPETEER_CACHE_DIR,
      puppeteer.default.configuration.cacheDirectory,
      path.join(os.homedir(), ".cache", "puppeteer"),
    ].filter((cacheDir) => cacheDir && path.resolve(cacheDir) !== repoCache);
    const source = userCaches.map(browserDetails).find(checkBrowserFiles);
    if (source) {
      fs.mkdirSync(path.dirname(details.installationDir), { recursive: true });
      fs.cpSync(source.installationDir, details.installationDir, {
        recursive: true,
        dereference: true,
      });
      console.log("[puppeteer:prepare] Copied the matching bundled Chrome:", details.buildId);
    } else if (!offline) {
      await browsers.install({
        browser: browsers.Browser.CHROME,
        buildId: details.buildId,
        platform: details.platform,
        cacheDir: repoCache,
      });
    } else {
      throw new Error(
        `Matching Chrome ${details.buildId} is missing. Run pnpm puppeteer:download while online before packaging.`,
      );
    }
  }

  if (!checkBrowserFiles(details))
    throw new Error("Bundled Chrome is incomplete; packaging cannot continue.");
  if (verify) {
    let browser;
    try {
      browser = await puppeteer.launch({
        executablePath: details.executablePath,
        headless: true,
        args: ["--no-sandbox"],
      });
      const page = await browser.newPage();
      await page.setContent("<!doctype html><p>Offline PDF runtime check</p>");
      const pdf = await page.pdf({ format: "A4" });
      if (Buffer.from(pdf).subarray(0, 5).toString() !== "%PDF-")
        throw new Error("Chrome PDF check returned invalid data.");
    } finally {
      if (browser) await browser.close();
    }
  }

  const manifest = {
    browser: "chrome",
    buildId: details.buildId,
    platform: details.platform,
    executablePath: path.relative(repoCache, details.executablePath).split(path.sep).join("/"),
  };
  fs.writeFileSync(path.join(repoCache, "browser.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log("[puppeteer:prepare] Offline browser verified:", manifest.executablePath);
  return manifest;
}

module.exports = { browserDetails, checkBrowserFiles, prepareBrowser };
if (require.main === module) {
  prepareBrowser({ offline: process.argv.includes("--offline") }).catch((error) => {
    console.error("[puppeteer:prepare]", error);
    process.exitCode = 1;
  });
}
