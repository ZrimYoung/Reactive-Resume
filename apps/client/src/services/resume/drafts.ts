import type { ResumeDto } from "@reactive-resume/dto";
import { resumeDataSchema } from "@reactive-resume/schema";

import type { DraftStorage, ResumeDraft } from "./save-queue";

const PREFIX = "reactive-resume-unsaved:";
const desktopBridge = (): Window["electron"] | undefined =>
  "electron" in window ? window.electron : undefined;

export const resumeDraftStorage: DraftStorage = {
  write(draft) {
    const bridge = desktopBridge();
    if (bridge) return bridge.writeResumeDraft(draft);
    try {
      window.localStorage.setItem(`${PREFIX}${draft.id}`, JSON.stringify(draft));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  async read(id) {
    const bridge = desktopBridge();
    const value: unknown = bridge
      ? await bridge.readResumeDraft(id)
      : JSON.parse(window.localStorage.getItem(`${PREFIX}${id}`) ?? "null");
    if (!value || typeof value !== "object") return null;
    const draft = value as ResumeDraft;
    if (
      draft.id !== id ||
      typeof draft.token !== "string" ||
      typeof draft.baseUpdatedAt !== "string" ||
      typeof draft.updatedAt !== "string"
    )
      return null;
    const parsed = resumeDataSchema.safeParse(draft.data);
    return parsed.success ? { ...draft, data: parsed.data } : null;
  },
  async remove(id, token) {
    const bridge = desktopBridge();
    if (bridge) return bridge.removeResumeDraft(id, token);
    const stored: unknown = JSON.parse(window.localStorage.getItem(`${PREFIX}${id}`) ?? "null");
    if (stored && (stored as ResumeDraft).token === token) {
      window.localStorage.removeItem(`${PREFIX}${id}`);
    }
  },
};

/** Recovery is always explicit and creates a copy, even when the saved resume has the same base revision. */
export function assessResumeDraft(draft: ResumeDraft, resume: ResumeDto) {
  return {
    hasChanges: JSON.stringify(draft.data) !== JSON.stringify(resume.data),
    baseChanged: draft.baseUpdatedAt !== new Date(resume.updatedAt).toISOString(),
  };
}
