/*
 * 动态为 electron-builder 设置带时间戳的输出目录。
 * 预期：通过 package.json 脚本调用，例如：
 *   node tools/build-electron.js
 *   node tools/build-electron.js --publish=never
 * 输出目录示例：dist-electron-20250118-235959
 */

const { build, Platform } = require("electron-builder");
const fs = require("node:fs");
const path = require("path");
const { prepare } = require("./electron/prepack");
const { verifyPackage } = require("./electron/verify-package");

function formatTimestamp(date) {
  const pad2 = (n) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad2(date.getMonth() + 1);
  const dd = pad2(date.getDate());
  const HH = pad2(date.getHours());
  const MM = pad2(date.getMinutes());
  const SS = pad2(date.getSeconds());
  return `${yyyy}${mm}${dd}-${HH}${MM}${SS}`;
}

async function main() {
  const timestamp = formatTimestamp(new Date());
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const outputDir = outputArg
    ? path.resolve(outputArg.slice("--output=".length))
    : path.join("dist-electron", `dist-electron-${timestamp}`);

  // 解析是否传入 --publish=never，以便与原有脚本 electron:dist 保持一致
  const publishArg = process.argv.find((arg) => arg.startsWith("--publish="));
  const publishOption = publishArg ? publishArg.split("=")[1] : "never";
  // 解析是否仅输出 unpacked 目录（等价于 electron-builder 的 dir 目标）
  const dirOnly = process.argv.includes("--dir") || process.argv.includes("--unpacked-only");
  const portableOnly = process.argv.includes("--portable");

  try {
    if (dirOnly && portableOnly) throw new Error("Choose either --dir or --portable.");
    if (portableOnly && process.platform !== "win32")
      throw new Error("The portable executable target requires a Windows build host.");
    await prepare({ build: false, offline: process.argv.includes("--offline") });
    const electronDist = path.join(path.dirname(require.resolve("electron/package.json")), "dist");
    const electronExecutable =
      process.platform === "win32"
        ? path.join(electronDist, "electron.exe")
        : process.platform === "darwin"
          ? path.join(electronDist, "Electron.app", "Contents", "MacOS", "Electron")
          : path.join(electronDist, "electron");
    if (!fs.existsSync(electronExecutable)) {
      throw new Error(
        "The local Electron runtime is missing. Run pnpm rebuild electron before packaging.",
      );
    }
    const buildOptions = {
      publish: publishOption,
      config: {
        electronDist,
        // 覆盖 package.json 中的 build.directories.output，使其带时间戳
        directories: {
          output: outputDir,
        },
        afterPack: verifyPackage,
      },
    };

    // Windows 下仅生成 unpacked（win-unpacked）目录，速度最快，便于调试
    if (dirOnly) {
      const platform =
        process.platform === "win32"
          ? Platform.WINDOWS
          : process.platform === "darwin"
            ? Platform.MAC
            : Platform.LINUX;
      buildOptions.targets = platform.createTarget(["dir"]);
    } else if (portableOnly) {
      buildOptions.targets = Platform.WINDOWS.createTarget(["portable"]);
    }

    await build(buildOptions);
  } catch (error) {
    console.error("[electron-builder] 打包失败：", error);
    process.exit(1);
  }
}

main();
