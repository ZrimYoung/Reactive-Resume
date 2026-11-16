/* eslint-disable lingui/no-unlocalized-strings -- Synthetic test fixtures and descriptions. */
import type { ResumeDto } from "@reactive-resume/dto";
import { defaultCustomSection, defaultResumeData, defaultSection } from "@reactive-resume/schema";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { debouncedUpdateResume } from "../services/resume";
import { loadResumeState, useResumeStore } from "./resume";

vi.mock("../services/resume", () => ({ debouncedUpdateResume: vi.fn() }));

const makeResume = (locked: boolean): ResumeDto => {
  const data = structuredClone(defaultResumeData);
  data.basics.name = "Saved name";
  data.sections.custom.example = {
    ...defaultSection,
    id: "example",
    name: "Custom",
    items: [{ ...defaultCustomSection, id: "entry" }],
  };
  data.metadata.layout[0][0].push("custom.example");
  return {
    id: "locked-test",
    title: "Locked test",
    slug: "locked-test",
    userId: "local-user-id",
    locked,
    data,
    createdAt: new Date("2026-11-16T00:00:00Z"),
    updatedAt: new Date("2026-11-16T00:00:00Z"),
  };
};

beforeEach(() => {
  loadResumeState(makeResume(true));
  vi.mocked(debouncedUpdateResume).mockClear();
});

describe("locked resume editing", () => {
  it("keeps field edits and custom section actions out of data, save queue and undo history", () => {
    const original = useResumeStore.getState().resume;
    useResumeStore.getState().setValue("basics.name", "Blocked edit");
    useResumeStore.getState().addSection();
    useResumeStore.getState().removeSection("custom.example");
    expect(useResumeStore.getState().resume).toBe(original);
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(0);
  });

  it("blocks both undo and redo while locked, even with pre-existing history", () => {
    loadResumeState(makeResume(false));
    useResumeStore.getState().setValue("basics.name", "Second name");
    useResumeStore.getState().setValue("basics.name", "Third name");
    useResumeStore.temporal.getState().undo();
    const temporal = useResumeStore.temporal.getState();
    expect(temporal.pastStates).toHaveLength(1);
    expect(temporal.futureStates).toHaveLength(1);
    temporal.pause();
    useResumeStore.setState({
      resume: Object.assign({}, useResumeStore.getState().resume, { locked: true }),
    });
    temporal.resume();
    const locked = useResumeStore.getState().resume;
    vi.mocked(debouncedUpdateResume).mockClear();
    useResumeStore.temporal.getState().undo();
    useResumeStore.temporal.getState().redo();
    expect(useResumeStore.getState().resume).toBe(locked);
    expect(useResumeStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useResumeStore.temporal.getState().futureStates).toHaveLength(1);
    expect(debouncedUpdateResume).not.toHaveBeenCalled();
  });

  it("resumes normal edits and their undo/redo after loading the unlocked server version", () => {
    loadResumeState(makeResume(false));
    useResumeStore.getState().setValue("basics.name", "After unlocking");
    expect(useResumeStore.getState().resume.data.basics.name).toBe("After unlocking");
    useResumeStore.temporal.getState().undo();
    expect(useResumeStore.getState().resume.data.basics.name).toBe("Saved name");
    useResumeStore.temporal.getState().redo();
    expect(useResumeStore.getState().resume.data.basics.name).toBe("After unlocking");
    expect(debouncedUpdateResume).toHaveBeenCalledTimes(3);
  });
});
