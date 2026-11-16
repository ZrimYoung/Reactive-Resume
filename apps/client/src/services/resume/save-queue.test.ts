/* eslint-disable lingui/no-unlocalized-strings -- Fixtures and test descriptions are not UI text. */
/* eslint-disable @typescript-eslint/require-await -- Promise-returning storage doubles model the IPC boundary. */
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { assessResumeDraft } from "./drafts";
import type { DraftStorage, ResumeDraft } from "./save-queue";
import { ResumeConflictError, ResumeSaveQueue } from "./save-queue";

const data = (name: string) => ({
  ...defaultResumeData,
  basics: { ...defaultResumeData.basics, name },
});
const resume = (id: string, name: string, revision = 0): ResumeDto => ({
  id,
  title: name,
  slug: id,
  data: data(name),
  userId: "local-user-id",
  locked: false,
  createdAt: new Date("2026-11-15T00:00:00Z"),
  updatedAt: new Date(Date.parse("2026-11-15T00:00:00Z") + revision * 1000),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const disk = new Map<string, ResumeDraft>();
  const storage: DraftStorage = {
    write: vi.fn((draft) => {
      disk.set(draft.id, JSON.parse(JSON.stringify(draft)) as ResumeDraft);
      return { ok: true };
    }),
    read: vi.fn(async (id) => disk.get(id) ?? null),
    remove: vi.fn(async (id, token) => {
      if (disk.get(id)?.token === token) disk.delete(id);
    }),
  };
  const save = vi.fn(
    async (request: Parameters<ConstructorParameters<typeof ResumeSaveQueue>[0]>[0]) =>
      Object.assign(resume(request.id, request.data?.basics.name ?? "Saved", 1), request, {
        updatedAt: resume(request.id, "", 1).updatedAt,
      }),
  );
  let sequence = 0;
  const queue = new ResumeSaveQueue(save, storage, () => `token-${++sequence}`);
  queue.register(resume("a", "Original"));
  return { queue, storage, disk, save };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("resume save queue", () => {
  it("coalesces unsent edits and writes a recovery snapshot synchronously before the debounce", async () => {
    const { queue, save, disk } = fixture();
    queue.enqueue({ id: "a", data: data("First") });
    queue.enqueue({ id: "a", data: data("Latest") });
    expect(save).not.toHaveBeenCalled();
    expect(disk.get("a")?.data.basics.name).toBe("Latest");
    expect(queue.getState("a")).toEqual({
      status: "pending",
      durable: true,
      draftUnavailable: false,
      error: undefined,
    });
    expect(await queue.flush("a")).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].data?.basics.name).toBe("Latest");
    expect(disk.has("a")).toBe(false);
  });

  it("never overlaps writes for one resume and flush waits for newer edits queued during a request", async () => {
    const { queue, save, disk } = fixture();
    const first = deferred<ResumeDto>();
    const last = deferred<ResumeDto>();
    save.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => last.promise);
    queue.enqueue({ id: "a", data: data("First") });
    const flushing = queue.flush("a");
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue({ id: "a", data: data("Intermediate") });
    queue.enqueue({ id: "a", data: data("Latest") });
    expect(save).toHaveBeenCalledTimes(1);
    const latestToken = disk.get("a")?.token;
    first.resolve(resume("a", "First", 1));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].data?.basics.name).toBe("Latest");
    expect(save.mock.calls[0][0].expectedUpdatedAt).toEqual(resume("a", "", 0).updatedAt);
    expect(save.mock.calls[1][0].expectedUpdatedAt).toEqual(resume("a", "", 1).updatedAt);
    expect(disk.get("a")?.token).toBe(latestToken);
    expect(disk.get("a")?.baseUpdatedAt).toBe(resume("a", "", 1).updatedAt.toISOString());
    expect(queue.hasPending("a")).toBe(true);
    last.resolve(resume("a", "Latest", 2));
    expect(await flushing).toBe(true);
    expect(queue.getState("a").status).toBe("saved");
    expect(disk.has("a")).toBe(false);
  });

  it("keeps different resumes independent when quickly switching between them", async () => {
    const { queue, save, disk } = fixture();
    queue.register(resume("b", "Other"));
    queue.enqueue({ id: "a", data: data("A changes") });
    queue.enqueue({ id: "b", data: data("B changes") });
    expect(await queue.flush("a")).toBe(true);
    expect(save.mock.calls.map(([request]) => request.id)).toEqual(["a"]);
    expect(disk.get("b")?.data.basics.name).toBe("B changes");
    expect(await queue.flush()).toBe(true);
    expect(save.mock.calls.map(([request]) => request.id)).toEqual(["a", "b"]);
  });

  it("retains the newest edits after a failed request, surfaces failure, and retries without dropping data", async () => {
    const { queue, save, disk } = fixture();
    const first = deferred<ResumeDto>();
    save.mockImplementationOnce(() => first.promise);
    queue.enqueue({ id: "a", data: data("First") });
    const flushing = queue.flush("a");
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue({ id: "a", data: data("Latest") });
    first.reject(new Error("Backend unavailable"));
    expect(await flushing).toBe(false);
    expect(queue.getState("a")).toEqual({
      status: "error",
      durable: true,
      draftUnavailable: false,
      error: "Backend unavailable",
    });
    expect(disk.get("a")?.data.basics.name).toBe("Latest");
    expect(await queue.flush("a")).toBe(true);
    expect(save.mock.calls[1][0].data?.basics.name).toBe("Latest");
    expect(queue.hasPending()).toBe(false);
  });

  it("does not call an unwritten latest draft durable, and can retry disk persistence before exit", async () => {
    const { queue, storage, save, disk } = fixture();
    queue.enqueue({ id: "a", data: data("Already on disk") });
    vi.mocked(storage.write).mockReturnValueOnce({ ok: false, error: "Disk full" });
    queue.enqueue({ id: "a", data: data("Newest changes") });
    expect(disk.get("a")?.data.basics.name).toBe("Already on disk");
    expect(queue.getState("a").durable).toBe(false);
    save.mockRejectedValueOnce(new Error("Offline"));
    vi.mocked(storage.write).mockReturnValueOnce({ ok: false });
    expect(await queue.flush("a")).toBe(false);
    expect(queue.getState("a").durable).toBe(false);
    expect(queue.persistAll()).toBe(true);
    expect(disk.get("a")?.data.basics.name).toBe("Newest changes");
  });

  it("does not let an older save acknowledgement remove a new draft written during asynchronous cleanup", async () => {
    const { queue, save, storage, disk } = fixture();
    const removal = deferred<undefined>();
    vi.mocked(storage.remove).mockImplementationOnce(async (id, token) => {
      await removal.promise;
      if (disk.get(id)?.token === token) disk.delete(id);
    });
    queue.enqueue({ id: "a", data: data("First") });
    const flushing = queue.flush("a");
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue({ id: "a", data: data("Newer") });
    expect(disk.get("a")?.data.basics.name).toBe("Newer");
    removal.resolve();
    expect(await flushing).toBe(true);
    expect(save.mock.calls[1][0].data?.basics.name).toBe("Newer");
  });

  it("serializes immediate metadata writes with content saves and preserves failed metadata for retry", async () => {
    const { queue, save } = fixture();
    const first = deferred<ResumeDto>();
    save.mockImplementationOnce(() => first.promise);
    const rename = queue.saveNow({ id: "a", title: "New title" });
    const handled = rename.catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(0);
    queue.enqueue({ id: "a", data: data("Latest text") });
    first.reject(new Error("Write failed"));
    expect(await handled).toBeInstanceOf(Error);
    expect(queue.getState("a").durable).toBe(false);
    expect(await queue.flush("a")).toBe(true);
    expect(save.mock.calls[1][0]).toMatchObject({ title: "New title", data: data("Latest text") });
  });
});

describe("flush acknowledgement boundary", () => {
  it("drains edits appended at the acknowledgement microtask boundary for concurrent flush callers", async () => {
    const { queue, save } = fixture();
    let appended = false;
    queue.subscribe(() => {
      if (queue.getState("a").status === "saved" && !appended) {
        appended = true;
        queueMicrotask(() => {
          queue.enqueue({ id: "a", data: data("Microtask edit") });
        });
      }
    });
    queue.enqueue({ id: "a", data: data("First") });
    const first = queue.flush("a");
    const joined = queue.flush("a");
    expect(await first).toBe(true);
    expect(await joined).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save.mock.calls[1][0].data?.basics.name).toBe("Microtask edit");
    expect(queue.hasPending("a")).toBe(false);
  });
});

describe("recovery assessment", () => {
  it("distinguishes an old acknowledgement from unsaved text without automatically writing either", () => {
    const current = resume("a", "Saved text", 2);
    const draft: ResumeDraft = {
      id: "a",
      token: "old",
      data: current.data,
      baseUpdatedAt: resume("a", "", 0).updatedAt.toISOString(),
      updatedAt: current.updatedAt.toISOString(),
    };
    expect(assessResumeDraft(draft, current)).toEqual({ hasChanges: false, baseChanged: true });
    expect(assessResumeDraft({ ...draft, data: data("Unsaved text") }, current)).toEqual({
      hasChanges: true,
      baseChanged: true,
    });
    expect(current.data.basics.name).toBe("Saved text");
  });
});

describe("conflicting saves", () => {
  it("pauses autosave and explicit retries after a conflict while persisting continued local edits", async () => {
    const { queue, save, disk } = fixture();
    save.mockRejectedValueOnce(new ResumeConflictError());
    queue.enqueue({ id: "a", data: data("Local first") });
    expect(await queue.flush("a")).toBe(false);
    expect(queue.getState("a").status).toBe("conflict");
    queue.enqueue({ id: "a", data: data("Local latest") });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await queue.flush("a")).toBe(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(disk.get("a")?.data.basics.name).toBe("Local latest");
    expect(queue.persistAll()).toBe(true);
    const token = queue.getDraft("a")?.token;
    await queue.acceptServer(resume("a", "Remote", 4), token);
    expect(queue.getState("a").status).toBe("saved");
    queue.enqueue({ id: "a", data: data("After explicit reload") });
    expect(await queue.flush("a")).toBe(true);
    expect(save.mock.calls[1][0].expectedUpdatedAt).toEqual(resume("a", "", 4).updatedAt);
  });

  it("cannot clear edits made while a recovered copy is being saved", async () => {
    const { queue, save, disk } = fixture();
    save.mockRejectedValueOnce(new ResumeConflictError());
    queue.enqueue({ id: "a", data: data("Copy in progress") });
    await queue.flush("a");
    const oldToken = queue.getDraft("a")?.token;
    queue.enqueue({ id: "a", data: data("Newer typing") });
    await expect(queue.acceptServer(resume("a", "Remote", 3), oldToken)).rejects.toThrow();
    expect(queue.getState("a").status).toBe("conflict");
    expect(disk.get("a")?.data.basics.name).toBe("Newer typing");
  });

  it("never sends an unversioned body and never regresses an acknowledged revision to an old editor snapshot", async () => {
    const { queue, save } = fixture();
    queue.enqueue({ id: "unknown", data: data("Missing revision") });
    expect(await queue.flush("unknown")).toBe(false);
    expect(queue.getState("unknown").status).toBe("conflict");
    expect(save).not.toHaveBeenCalled();
    queue.enqueue({ id: "a", data: data("First") });
    await queue.flush("a");
    queue.register(resume("a", "Old snapshot", 0));
    queue.enqueue({ id: "a", title: "Rename", updatedAt: resume("a", "", 0).updatedAt });
    await queue.flush("a");
    expect(save.mock.calls[1][0].expectedUpdatedAt).toEqual(resume("a", "", 1).updatedAt);
  });
});
