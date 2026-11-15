import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { ConfigService } from "@nestjs/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StorageService } from "../storage/storage.service";
import { FontService } from "./font.service";
import { VariableFontParserService } from "./variable-font-parser.service";

const prefix = path.join(os.tmpdir(), "reactive-resume-font-tests-");
let directory: string;
let previousStorage: string | undefined;

beforeEach(async () => {
  directory = await fs.mkdtemp(prefix);
  previousStorage = process.env.STORAGE_DIR;
  process.env.STORAGE_DIR = directory;
});

afterEach(async () => {
  if (previousStorage === undefined) delete process.env.STORAGE_DIR;
  else process.env.STORAGE_DIR = previousStorage;
  if (!path.resolve(directory).startsWith(prefix)) throw new Error("Unexpected cleanup path");
  await fs.rm(directory, { recursive: true, force: true });
});

const createService = (port = 3301) => {
  const config = new ConfigService({ STORAGE_URL: `http://127.0.0.1:${port}` });
  return new FontService(config, new StorageService(config), new VariableFontParserService());
};

describe("offline font persistence", () => {
  it("preserves a custom Chinese multiword family and stable ID on the first request after restarting on a new port", async () => {
    const buffer = Buffer.from("test font binary");
    const uploaded = await createService().uploadFont(
      { originalname: "custom.woff2", buffer, size: buffer.length },
      "local-user-id",
      { fontFamily: "中文 Custom Font" },
    );
    const recovered = await createService(3309).getUserFonts("local-user-id");
    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe(uploaded.id);
    expect(recovered[0].fontFamily).toBe("中文 Custom Font");
    expect(recovered[0].url).toMatch(/^http:\/\/127\.0\.0\.1:3309\/api\/storage\//);
    expect(recovered[0].url).not.toContain(":3301/");
  });

  it("returns legacy disk fonts immediately and persists the full filename family fallback", async () => {
    const fontDir = path.join(directory, "local-user-id", "fonts");
    await fs.mkdir(fontDir, { recursive: true });
    await fs.writeFile(
      path.join(fontDir, "My_Custom_Font_12345678-1234-1234-1234-123456789abc.ttf"),
      "legacy font",
    );
    const service = createService();
    const [first, concurrent] = await Promise.all([
      service.getUserFonts("local-user-id"),
      service.getUserFonts("local-user-id"),
    ]);
    const second = await createService().getUserFonts("local-user-id");
    expect(first).toHaveLength(1);
    expect(first[0].fontFamily).toBe("My Custom Font");
    expect(concurrent[0].id).toBe(first[0].id);
    expect(second[0].id).toBe(first[0].id);
  });

  it("actually removes a selected font and its metadata while rejecting unknown IDs", async () => {
    const service = createService();
    const buffer = Buffer.from("font");
    const uploaded = await service.uploadFont(
      { originalname: "font.woff", buffer, size: buffer.length },
      "local-user-id",
      { fontFamily: "Remove Me" },
    );
    await expect(service.deleteFont("unknown", "local-user-id")).rejects.toThrow("Font not found");
    expect(await service.getUserFonts("local-user-id")).toHaveLength(1);
    await service.deleteFont(uploaded.id, "local-user-id");
    expect(await createService().getUserFonts("local-user-id")).toEqual([]);
    expect(await fs.readdir(path.join(directory, "local-user-id", "fonts"))).toEqual([]);
  });
});
