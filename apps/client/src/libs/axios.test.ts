/* eslint-disable lingui/no-unlocalized-strings -- Protocol fixtures are not UI text. */
import { expect, it, vi } from "vitest";

import { axios } from "./axios";

vi.mock("../services/errors/translate-error", () => ({ translateError: () => null }));

it("preserves the error response needed to pause an optimistic save after HTTP 409", async () => {
  const body = {
    code: "RESUME_VERSION_CONFLICT",
    updatedAt: "2026-11-16T12:00:00Z",
    message: "Newer saved version",
  };
  const error = Object.assign(new Error("Request failed"), {
    response: { status: 409, data: body },
  });
  await expect(
    axios.patch("/resume/test", {}, { adapter: () => Promise.reject(error) }),
  ).rejects.toMatchObject({ message: body.message, response: { status: 409, data: body } });
});
