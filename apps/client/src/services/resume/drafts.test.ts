/* eslint-disable lingui/no-unlocalized-strings -- Test fixtures are not UI text. */
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { afterEach, expect, it, vi } from "vitest";

import { listResumeDrafts, resumeDraftStorage } from "./drafts";
import { ResumeConflictError, ResumeSaveQueue } from "./save-queue";

afterEach(() => {
  window.localStorage.clear();
  vi.useRealTimers();
});

it("keeps two browser sessions and a legacy draft separate through acknowledgements and restart", async () => {
  vi.useFakeTimers();
  const resume: ResumeDto = {
    id: "resume123",
    title: "Original",
    slug: "original",
    locked: false,
    userId: "local-user-id",
    createdAt: new Date("2026-11-16T00:00:00Z"),
    updatedAt: new Date("2026-11-16T00:00:00Z"),
    data: structuredClone(defaultResumeData),
  };
  const data = (name: string) => ({ ...resume.data, basics: { ...resume.data.basics, name } });
  window.localStorage.setItem(
    "reactive-resume-unsaved:resume123",
    JSON.stringify({
      id: resume.id,
      token: "legacy",
      data: data("Legacy"),
      baseUpdatedAt: resume.updatedAt.toISOString(),
      updatedAt: resume.updatedAt.toISOString(),
    }),
  );
  let firstSequence = 0;
  let secondSequence = 0;
  const first = new ResumeSaveQueue(
    (request) =>
      Promise.resolve(
        Object.assign({}, resume, {
          data: request.data ?? resume.data,
          updatedAt: new Date(resume.updatedAt.getTime() + 1),
        }),
      ),
    resumeDraftStorage,
    () => `first-${++firstSequence}`,
  );
  const second = new ResumeSaveQueue(
    () => Promise.reject(new ResumeConflictError()),
    resumeDraftStorage,
    () => `second-${++secondSequence}`,
  );
  first.register(resume);
  second.register(resume);
  first.enqueue({ id: resume.id, data: data("First window") });
  second.enqueue({ id: resume.id, data: data("Second window") });
  expect(await listResumeDrafts(resume.id)).toHaveLength(3);
  expect(await first.flush(resume.id)).toBe(true);
  expect(await second.flush(resume.id)).toBe(false);
  const reopened = await listResumeDrafts(resume.id);
  expect(new Set(reopened.map((draft) => draft.data.basics.name))).toEqual(
    new Set(["Legacy", "Second window"]),
  );
  await resumeDraftStorage.remove(resume.id, "legacy");
  const latest = await resumeDraftStorage.read(resume.id);
  expect(latest?.data.basics.name).toBe("Second window");
});
