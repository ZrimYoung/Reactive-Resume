/* eslint-disable lingui/no-unlocalized-strings -- Synthetic test fixtures and descriptions. */
/* eslint-disable @typescript-eslint/require-await -- Async storage doubles model the IPC boundary. */
import type { ResumeDto, UpdateResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { QueryObserver } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { queryClient } from "@/client/libs/query-client";
import { loadResumeState, useResumeStore } from "@/client/stores/resume";

import { lockResume } from "./lock";
import { resumeSaveQueue, updateResume } from "./update";

const { patch } = vi.hoisted(() => ({
  patch:
    vi.fn<
      (url: string, body: UpdateResumeDto, options?: unknown) => Promise<{ data: ResumeDto }>
    >(),
}));
vi.mock("@/client/libs/axios", () => ({ axios: { patch } }));
vi.mock("./preview", () => ({ previewResume: vi.fn() }));
vi.mock("./drafts", () => ({
  resumeDraftStorage: {
    write: vi.fn(() => ({ ok: true })),
    remove: vi.fn(() => Promise.resolve()),
    read: vi.fn(async () => null),
  },
}));

const makeResume = (id: string, name: string, revision = 0): ResumeDto => {
  const data = structuredClone(defaultResumeData);
  data.basics.name = name;
  return {
    id,
    title: name,
    slug: id,
    data,
    locked: false,
    userId: "local-user-id",
    createdAt: new Date("2026-11-16T00:00:00Z"),
    updatedAt: new Date(Date.parse("2026-11-16T00:00:00Z") + revision),
  };
};

beforeEach(() => {
  vi.useFakeTimers();
  queryClient.clear();
  vi.clearAllMocks();
});
afterEach(() => {
  queryClient.clear();
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("saved resume cache", () => {
  it("replaces the inactive library snapshot before it remounts and supplies data for duplication", async () => {
    const old = makeResume("cache-update", "Before editing");
    const other = makeResume("cache-other", "Other resume");
    const saved = makeResume(old.id, "After editing", 1);
    queryClient.setQueryData(["resumes"], [old, other]);
    queryClient.setQueryData(["resume", { id: old.id }], old);
    const fetchList = vi.fn(async () => [old, other]);
    const observer = new QueryObserver(queryClient, { queryKey: ["resumes"], queryFn: fetchList });
    const unsubscribe = observer.subscribe(vi.fn());
    unsubscribe(); // Entering the builder removes the list observer.
    patch.mockResolvedValueOnce({ data: saved });
    await updateResume({ id: old.id, data: saved.data, updatedAt: old.updatedAt });
    const library = queryClient.getQueryData<ResumeDto[]>(["resumes"]);
    expect(library?.[0]).toEqual(saved);
    expect(library?.[1]).toBe(other);
    expect(queryClient.getQueryData(["resume", { id: old.id }])).toEqual(saved);
    const stop = observer.subscribe(vi.fn());
    expect(fetchList).not.toHaveBeenCalled();
    // ResumeDialog copies this exact library item rather than fetching its body again.
    expect(observer.getCurrentResult().data?.[0].data.basics.name).toBe("After editing");
    expect(queryClient.getQueryState(["resumes"])?.isInvalidated).toBe(true);
    stop();
  });

  it("does not create an incomplete library cache when only the detail was loaded", async () => {
    const old = makeResume("cache-missing-list", "Before editing");
    const saved = makeResume(old.id, "After editing", 1);
    queryClient.setQueryData(["resume", { id: old.id }], old);
    patch.mockResolvedValueOnce({ data: saved });
    await updateResume({ id: old.id, data: saved.data, updatedAt: old.updatedAt });
    expect(queryClient.getQueryData(["resumes"])).toBeUndefined();
  });
});

it("keeps locked edits out of the writer so a pure metadata unlock can complete", async () => {
  const locked = makeResume("unlock-after-blocked-edit", "Saved content");
  locked.locked = true;
  const unlocked = Object.assign({}, locked, {
    locked: false,
    updatedAt: new Date(locked.updatedAt.getTime() + 1),
  });
  queryClient.setQueryData(["resumes"], [locked]);
  queryClient.setQueryData(["resume", { id: locked.id }], locked);
  resumeSaveQueue.register(locked);
  loadResumeState(locked);
  useResumeStore.getState().setValue("basics.name", "Should not be queued");
  expect(resumeSaveQueue.hasPending(locked.id)).toBe(false);
  expect(patch).not.toHaveBeenCalled();
  patch.mockImplementationOnce(async (_url, update) => {
    expect(update.locked).toBe(false);
    expect(update.data).toBeUndefined();
    return { data: unlocked };
  });
  expect(await lockResume({ id: locked.id, set: false, updatedAt: locked.updatedAt })).toBe(
    unlocked,
  );
  expect(resumeSaveQueue.hasPending(locked.id)).toBe(false);
  expect(queryClient.getQueryData<ResumeDto[]>(["resumes"])?.[0].locked).toBe(false);
  expect(useResumeStore.getState().resume.data.basics.name).toBe("Saved content");
});
