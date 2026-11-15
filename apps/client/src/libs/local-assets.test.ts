/* eslint-disable lingui/no-unlocalized-strings -- Synthetic HTTP fixtures are not user-facing. */
import { AxiosHeaders } from "axios";
import { describe, expect, it } from "vitest";

import { axios } from "./axios";
import { normalizeLocalAssetUrls } from "./local-assets";

describe("local storage assets after a backend port change", () => {
  it("preserves non-JSON download bodies and already-parsed dates", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const date = new Date();
    expect(normalizeLocalAssetUrls(bytes, window.location.origin)).toBe(bytes);
    expect(normalizeLocalAssetUrls(date, window.location.origin)).toBe(date);
  });
  it("normalizes a real Axios resume response before date conversion, including the editor avatar", async () => {
    const payload = {
      createdAt: "2026-11-15T10:00:00.000Z",
      data: {
        basics: {
          picture: { url: "http://localhost:3307/api/storage/local-user-id/pictures/avatar.jpg" },
          url: { href: "https://example.com/profile" },
        },
        metadata: {
          css: {
            value:
              '.photo { background:url("http://127.0.0.1:3307/api/storage/local-user-id/pictures/photo.jpg") }',
          },
        },
        otherLocalService: "http://localhost:3307/another-app/file.jpg",
        externalStorage: "https://example.com/api/storage/avatar.jpg",
      },
    };
    const response = await axios.get<typeof payload>("/resume/test-document", {
      adapter: (config) =>
        Promise.resolve({
          data: payload,
          status: 200,
          statusText: "OK",
          headers: new AxiosHeaders(),
          config,
        }),
    });
    expect(response.data.data.basics.picture.url).toBe(
      `${window.location.origin}/api/storage/local-user-id/pictures/avatar.jpg`,
    );
    expect(response.data.data.metadata.css.value).toContain(
      `${window.location.origin}/api/storage/local-user-id/pictures/photo.jpg`,
    );
    expect(response.data.data.basics.url.href).toBe(payload.data.basics.url.href);
    expect(response.data.data.otherLocalService).toBe(payload.data.otherLocalService);
    expect(response.data.data.externalStorage).toBe(payload.data.externalStorage);
    expect(response.data.createdAt).toBeInstanceOf(Date);
    expect(payload.data.basics.picture.url).toContain("localhost:3307");
  });
});
