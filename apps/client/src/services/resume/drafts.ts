import type { ResumeDto } from "@reactive-resume/dto";
import { resumeDataSchema } from "@reactive-resume/schema";

import type { DraftStorage, ResumeDraft } from "./save-queue";

const PREFIX = "reactive-resume-unsaved:";
const desktopBridge = (): Window["electron"] | undefined =>
  "electron" in window ? window.electron : undefined;

const key = (draft: ResumeDraft) =>
  `${PREFIX}${draft.id}${draft.sessionId ? `:${draft.sessionId}` : ""}`;

function parseDraft(value: unknown, id: string): ResumeDraft | null {
  if (!value || typeof value !== "object") return null;
  const draft = value as ResumeDraft;
  if (
    draft.id !== id ||
    typeof draft.token !== "string" ||
    !Number.isFinite(Date.parse(draft.baseUpdatedAt)) ||
    !Number.isFinite(Date.parse(draft.updatedAt)) ||
    (draft.sessionId !== undefined && !/^[\w-]{1,64}$/i.test(draft.sessionId))
  )
    return null;
  const parsed = resumeDataSchema.safeParse(draft.data);
  return parsed.success ? { ...draft, data: parsed.data } : null;
}

export async function listResumeDrafts(id: string): Promise<ResumeDraft[]> {
  const bridge = desktopBridge();
  let values: unknown[];
  if (bridge) {
    values = bridge.listResumeDrafts
      ? await bridge.listResumeDrafts(id)
      : [await bridge.readResumeDraft(id)];
  } else {
    values = Object.keys(window.localStorage)
      .filter((name) => name === `${PREFIX}${id}` || name.startsWith(`${PREFIX}${id}:`))
      .map((name) => JSON.parse(window.localStorage.getItem(name) ?? "null") as unknown);
  }
  return values
    .map((value) => parseDraft(value, id))
    .filter((draft): draft is ResumeDraft => draft !== null)
    .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
}

export const resumeDraftStorage: DraftStorage = {
  write(draft) {
    const bridge = desktopBridge();
    if (bridge) return bridge.writeResumeDraft(draft);
    try {
      window.localStorage.setItem(key(draft), JSON.stringify(draft));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  },
  async read(id) {
    const drafts = await listResumeDrafts(id);
    return drafts[0] ?? null;
  },
  list: listResumeDrafts,
  async remove(id, token) {
    const bridge = desktopBridge();
    if (bridge) return bridge.removeResumeDraft(id, token);
    for (const draft of await listResumeDrafts(id)) {
      if (draft.token === token) window.localStorage.removeItem(key(draft));
    }
  },
};

/** Recovery is always explicit and creates a copy, even when the saved resume has the same base revision. */
export function assessResumeDraft(draft: ResumeDraft, resume: ResumeDto) {
  return {
    hasChanges:
      JSON.stringify(draft.data) !== JSON.stringify(resume.data) ||
      (draft.title !== undefined && draft.title !== resume.title) ||
      (draft.slug !== undefined && draft.slug !== resume.slug) ||
      (draft.locked !== undefined && draft.locked !== resume.locked),
    baseChanged: draft.baseUpdatedAt !== new Date(resume.updatedAt).toISOString(),
  };
}
