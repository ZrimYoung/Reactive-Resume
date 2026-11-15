const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { Readable } = require("node:stream");
const { pipeline } = require("node:stream/promises");
async function findFreePort(start = 3000) {
  for (let port = start; port < start + 50; port++) {
    const available = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolve(true)));
    });
    if (available) return port;
  }
  throw new Error("没有可用的本地端口，请关闭重复运行的程序后重试。");
}
function getBrowserPath(resourcesPath) {
  const root = path.resolve(resourcesPath, "puppeteer");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "browser.json"), "utf8"));
  const executable = path.resolve(root, manifest.executablePath);
  if (!executable.startsWith(root + path.sep) || !fs.existsSync(executable))
    throw new Error("打印组件不完整，请重新解压完整程序目录。");
  return executable;
}
function backendEnvironment(
  resourcesPath,
  userDataDir,
  port,
  instanceToken,
  inherited = process.env,
) {
  const unpacked = path.join(resourcesPath, "app.asar.unpacked");
  const environment = {
    ...inherited,
    NODE_ENV: "production",
    PORT: String(port),
    HOST: "127.0.0.1",
    PUBLIC_URL: `http://127.0.0.1:${port}`,
    STORAGE_URL: `http://127.0.0.1:${port}`,
    DATABASE_URL: `file:${path.join(userDataDir, "local-resume.db").replace(/\\/g, "/")}`,
    STORAGE_DIR: path.join(userDataDir, "storage"),
    ELECTRON_USER_DATA_DIR: userDataDir,
    ELECTRON_RESOURCES_PATH: resourcesPath,
    ELECTRON_INSTANCE_TOKEN: instanceToken,
    ELECTRON_RUN_AS_NODE: "1",
    PUPPETEER_CACHE_DIR: path.join(resourcesPath, "puppeteer"),
    NODE_PATH: [
      resourcesPath,
      path.join(unpacked, "node_modules"),
      path.join(resourcesPath, "app.asar", "node_modules"),
    ].join(path.delimiter),
  };
  for (const key of [
    "CHROME_PATH",
    "PUPPETEER_EXECUTABLE_PATH",
    "PRISMA_QUERY_ENGINE_BINARY",
    "PRISMA_QUERY_ENGINE_LIBRARY",
    "PRISMA_SCHEMA_ENGINE_BINARY",
  ])
    delete environment[key];
  try {
    environment.PUPPETEER_EXECUTABLE_PATH = getBrowserPath(resourcesPath);
  } catch {
    environment.PUPPETEER_EXECUTABLE_PATH = path.join(
      resourcesPath,
      "puppeteer",
      "missing-print-component",
    );
  }
  const engineDir = path.join(resourcesPath, ".prisma", "client");
  const engine =
    fs.existsSync(engineDir) &&
    fs
      .readdirSync(engineDir)
      .find((name) =>
        process.platform === "win32"
          ? name === "query_engine-windows.dll.node"
          : name.endsWith(".node"),
      );
  if (engine) environment.PRISMA_QUERY_ENGINE_LIBRARY = path.join(engineDir, engine);
  return environment;
}
function checkReadiness(port, instanceToken) {
  return new Promise((resolve) => {
    const request = http.get(
      { hostname: "127.0.0.1", port, path: "/api/health/startup", timeout: 1500 },
      (response) => {
        let body = "";
        response.on("data", (chunk) => {
          if (body.length < 65536) body += chunk;
        });
        response.on("error", () => resolve(false));
        response.on("end", () => {
          try {
            const result = JSON.parse(body);
            resolve(
              response.statusCode === 200 &&
                result.status === "ok" &&
                result.instance === instanceToken,
            );
          } catch {
            resolve(false);
          }
        });
      },
    );
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}
async function waitForBackend({ port, instanceToken, child, signal, timeout = 60000 }) {
  let exited = false;
  const onExit = () => {
    exited = true;
  };
  child.once("exit", onExit);
  const deadline = Date.now() + timeout;
  try {
    while (Date.now() < deadline) {
      if (signal.aborted) throw new Error("启动已取消");
      if (exited || child.exitCode !== null)
        throw new Error("本地服务未能启动，请查看日志或点击重试。");
      if (await checkReadiness(port, instanceToken)) return;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("启动超时，请查看日志后重试。");
  } finally {
    child.removeListener("exit", onExit);
  }
}
async function saveDownload(url, destination) {
  if (!["data:", "http:", "https:"].includes(new URL(url).protocol))
    throw new Error("不支持的导出地址");
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok || !response.body) throw new Error(`导出失败 (${response.status})`);
    await pipeline(
      Readable.fromWeb(response.body),
      fs.createWriteStream(temporary, { flags: "wx" }),
    );
    await fs.promises.rename(temporary, destination);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}
module.exports = {
  findFreePort,
  getBrowserPath,
  backendEnvironment,
  checkReadiness,
  waitForBackend,
  saveDownload,
};
