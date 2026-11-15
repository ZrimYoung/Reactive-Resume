/* eslint-disable lingui/no-unlocalized-strings -- Test fixtures are not displayed to users. */
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultResumeData } from "@reactive-resume/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { debouncedUpdateResume } from "../services/resume";
import { loadResumeState, useResumeStore } from "./resume";

vi.mock("../services/resume", () => ({ debouncedUpdateResume: vi.fn() }));

const makeResume = (id: string, name: string): ResumeDto => ({
  id,
  title: name,
  slug: id,
  userId: "local-user-id",
  locked: false,
  createdAt: new Date("2026-11-15T00:00:00Z"),
  updatedAt: new Date("2026-11-15T00:00:00Z"),
  data: { ...defaultResumeData, basics: { ...defaultResumeData.basics, name } },
});

beforeEach(() => {
  loadResumeState(makeResume("a", "Saved name"));
  vi.mocked(debouncedUpdateResume).mockClear();
});

describe("resume autosave subscription", () => {
  it("does not autosave server hydration or an offered recovery draft before the user chooses", () => {
    const saved = makeResume("b", "Server name");
    loadResumeState(saved, {
      id: "b",
      token: "old-draft",
      data: makeResume("b", "Unsaved name").data,
      baseUpdatedAt: "2026-11-14T00:00:00Z",
      updatedAt: "2026-11-14T01:00:00Z",
    });
    expect(useResumeStore.getState().resume.data.basics.name).toBe("Server name");
    expect(useResumeStore.getState().recoveryDraft?.data.basics.name).toBe("Unsaved name");
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("queues user edits with their resume id and baseline, and queues undo/redo changes too", () => {
    useResumeStore.getState().setValue("basics.name", "Edited name");
    expect(debouncedUpdateResume).toHaveBeenLastCalledWith({
      id: "a",
      data: makeResume("a", "Edited name").data,
      updatedAt: new Date("2026-11-15T00:00:00Z"),
    });
    useResumeStore.temporal.getState().undo();
    expect(vi.mocked(debouncedUpdateResume).mock.lastCall?.[0].data?.basics.name).toBe(
      "Saved name",
    );
    useResumeStore.temporal.getState().redo();
    expect(vi.mocked(debouncedUpdateResume).mock.lastCall?.[0].data?.basics.name).toBe(
      "Edited name",
    );
  });
});
