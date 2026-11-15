const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { EventEmitter } = require("node:events");
const {
  saveDownload,
  checkReadiness,
  findFreePort,
  backendEnvironment,
  waitForBackend,
  getBrowserPath,
} = require("../desktop-runtime");

async function temporary(run) {
  const parent = path.resolve("tmp/desktop-runtime-tests");
  fs.mkdirSync(parent, { recursive: true });
  const directory = fs.mkdtempSync(path.join(parent, "test-"));
  try {
    await run(directory);
  } finally {
    assert.ok(directory.startsWith(parent + path.sep));
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("JSON and Markdown data URLs preserve Unicode and replace an existing export only on success", () =>
  temporary(async (directory) => {
    const destination = path.join(directory, "简历.json");
    const content = JSON.stringify({ name: "离线用户", summary: "A & B\n测试" });
    fs.writeFileSync(destination, "old");
    await saveDownload(
      `data:application/json;charset=utf-8,${encodeURIComponent(content)}`,
      destination,
    );
    assert.equal(fs.readFileSync(destination, "utf8"), content);
    await assert.rejects(saveDownload("file:///not-an-export", destination));
    assert.equal(fs.readFileSync(destination, "utf8"), content);
    assert.deepEqual(fs.readdirSync(directory), ["简历.json"]);
  }));

test("failed HTTP downloads keep the old file and remove the temporary file", () =>
  temporary(async (directory) => {
    const server = http.createServer((_request, response) => {
      response.writeHead(500);
      response.end("failed");
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      const destination = path.join(directory, "existing.pdf");
      fs.writeFileSync(destination, "existing backup");
      await assert.rejects(
        saveDownload(`http://127.0.0.1:${server.address().port}/pdf`, destination),
      );
      assert.equal(fs.readFileSync(destination, "utf8"), "existing backup");
      assert.deepEqual(fs.readdirSync(directory), ["existing.pdf"]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }));

test("startup only accepts its own backend, and an occupied port is skipped", async () => {
  const server = http.createServer((_request, response) => {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ status: "ok", instance: "owned" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const port = server.address().port;
    assert.equal(await checkReadiness(port, "other"), false);
    assert.equal(await checkReadiness(port, "owned"), true);
    assert.notEqual(await findFreePort(port), port);
    const child = new EventEmitter();
    child.exitCode = null;
    await waitForBackend({
      port,
      instanceToken: "owned",
      child,
      signal: new AbortController().signal,
    });
    assert.equal(child.listenerCount("exit"), 0);
    const aborted = new AbortController();
    aborted.abort();
    await assert.rejects(
      waitForBackend({ port, instanceToken: "owned", child, signal: aborted.signal }),
      /取消/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("packaged paths use the resources parent, isolate stale machine settings, and never modify the install", () =>
  temporary(async (directory) => {
    const resources = path.join(directory, "只读程序 resources");
    const browser = path.join(resources, "puppeteer", "chrome", "chrome.exe");
    fs.mkdirSync(path.dirname(browser), { recursive: true });
    fs.writeFileSync(browser, "fixture");
    fs.writeFileSync(
      path.join(resources, "puppeteer", "browser.json"),
      JSON.stringify({ executablePath: "chrome/chrome.exe" }),
    );
    assert.equal(getBrowserPath(resources), browser);
    const user = path.join(directory, "用户数据");
    const env = backendEnvironment(resources, user, 3001, "token", {
      CHROME_PATH: "broken",
      DATABASE_URL: "old",
      NODE_PATH: "developer-modules",
    });
    assert.equal(env.CHROME_PATH, undefined);
    assert.equal(env.PUPPETEER_EXECUTABLE_PATH, browser);
    assert.equal(env.NODE_PATH.split(path.delimiter)[0], resources);
    assert.equal(env.PUBLIC_URL, "http://127.0.0.1:3001");
    assert.ok(env.DATABASE_URL.endsWith("/用户数据/local-resume.db"));
    assert.equal(fs.existsSync(user), false);
    fs.writeFileSync(
      path.join(resources, "puppeteer", "browser.json"),
      JSON.stringify({ executablePath: "../outside.exe" }),
    );
    assert.throws(() => getBrowserPath(resources));
  }));
