import type { ResumeDto } from "@reactive-resume/dto";
import type { ResumeData } from "@reactive-resume/schema";

export type ResumeDraft = {
  id: string;
  token: string;
  data: ResumeData;
  baseUpdatedAt: string;
  updatedAt: string;
  sessionId?: string;
  title?: string;
  slug?: string;
  locked?: boolean;
};

export type DraftStorage = {
  write: (draft: ResumeDraft) => { ok: boolean; error?: string };
  read: (id: string) => Promise<ResumeDraft | null>;
  remove: (id: string, token: string) => Promise<void>;
  list?: (id: string) => Promise<ResumeDraft[]>;
};

export type ResumeSaveState = {
  status: "saved" | "pending" | "saving" | "error" | "conflict";
  durable: boolean;
  draftUnavailable: boolean;
  error?: string;
};

export type ResumeSaveRequest = {
  id: string;
  data?: ResumeData;
  title?: string;
  slug?: string;
  locked?: boolean;
  updatedAt?: Date;
  expectedUpdatedAt?: Date;
};

export class ResumeConflictError extends Error {
  constructor(
    readonly code = "RESUME_VERSION_CONFLICT",
    readonly updatedAt?: string,
  ) {
    super(code);
    this.name = ResumeConflictError.name;
  }
}
type Request = ResumeSaveRequest;
type Pending = { request: Request; token: string };
type Entry = {
  id: string;
  baseUpdatedAt: string;
  pending?: Pending;
  inFlight?: Pending;
  draft?: ResumeDraft;
  persistedToken?: string;
  timer?: ReturnType<typeof setTimeout>;
  running?: Promise<boolean>;
  response?: ResumeDto;
  snapshot?: ResumeDto;
  conflict?: boolean;
  error?: Error;
  state: ResumeSaveState;
};

const SAVED: ResumeSaveState = { status: "saved", durable: true, draftUnavailable: false };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const iso = (value: Date | string) => new Date(value).toISOString();

/** One serial writer per resume. Only unsent changes are coalesced; edits on other resumes stay independent. */
export class ResumeSaveQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly listeners = new Set<() => void>();
  private readonly sessionId: string;

  constructor(
    private readonly save: (request: Request) => Promise<ResumeDto>,
    private readonly storage: DraftStorage,
    private readonly token: () => string,
    private readonly delay = 500,
  ) {
    this.sessionId = token();
  }

  readonly subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState(id: string): ResumeSaveState {
    return this.entries.get(id)?.state ?? SAVED;
  }

  getDraft(id: string) {
    return this.entries.get(id)?.draft;
  }

  hasPending(id?: string) {
    return this.selected(id).some((entry) => entry.pending ?? entry.inFlight);
  }

  register(resume: ResumeDto) {
    const entry = this.entry(resume.id);
    if (
      !entry.pending &&
      !entry.inFlight &&
      !entry.conflict &&
      (!entry.baseUpdatedAt || iso(resume.updatedAt) >= entry.baseUpdatedAt)
    ) {
      entry.baseUpdatedAt = iso(resume.updatedAt);
      entry.snapshot = copy(resume);
    }
  }

  enqueue(request: Request) {
    const entry = this.entry(request.id);
    const baseline = request.expectedUpdatedAt ?? request.updatedAt;
    if (!entry.baseUpdatedAt && baseline) entry.baseUpdatedAt = iso(baseline);
    entry.pending = {
      request: copy({ ...entry.pending?.request, ...request }),
      token: this.token(),
    };
    if (!entry.conflict) entry.error = undefined;
    this.persist(entry);
    if (entry.timer) clearTimeout(entry.timer);
    if (!entry.conflict) entry.timer = setTimeout(() => void this.flush(request.id), this.delay);
    this.publish(entry);
  }

  async saveNow(request: Request) {
    this.enqueue(request);
    if (!(await this.flush(request.id)))
      throw this.entry(request.id).error ?? new Error("Save failed");
    const response = this.entry(request.id).response;
    if (!response) throw new Error("Missing save acknowledgement");
    return response;
  }

  /** Resolves false on failure; rejected autosaves never become unhandled promises. */
  async flush(id?: string): Promise<boolean> {
    do {
      const results = await Promise.all(this.selected(id).map((entry) => this.flushEntry(entry)));
      if (!results.every(Boolean)) return false;
    } while (this.hasPending(id));
    return true;
  }

  persistAll() {
    for (const entry of this.entries.values()) {
      if (entry.pending || entry.inFlight) {
        this.persist(entry);
        this.publish(entry);
      }
    }
    return this.selected().every((entry) => !this.isDirty(entry) || entry.state.durable);
  }

  /** Called only after the local version was explicitly kept or discarded by the user. */
  async acceptServer(resume: ResumeDto, token?: string) {
    const entry = this.entry(resume.id);
    if (entry.inFlight || entry.running) throw new Error("A save is still in progress");
    if (token && entry.draft?.token !== token)
      throw new Error("The local changes changed while reloading");
    if (entry.timer) clearTimeout(entry.timer);
    if (entry.draft) await this.storage.remove(entry.id, entry.draft.token);
    // Check again: synchronous edits may have arrived while the disk IPC was in progress.
    if (token && entry.draft?.token !== token)
      throw new Error("The local changes changed while reloading");
    entry.pending = undefined;
    entry.draft = undefined;
    entry.persistedToken = undefined;
    entry.error = undefined;
    entry.conflict = false;
    entry.baseUpdatedAt = iso(resume.updatedAt);
    entry.snapshot = copy(resume);
    entry.response = resume;
    this.publish(entry);
  }

  private entry(id: string) {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { id, baseUpdatedAt: "", state: SAVED };
      this.entries.set(id, entry);
    }
    return entry;
  }

  private selected(id?: string) {
    if (id) {
      const entry = this.entries.get(id);
      return entry ? [entry] : [];
    }
    return [...this.entries.values()];
  }

  private isDirty(entry: Entry) {
    return Boolean(entry.pending ?? entry.inFlight);
  }

  private persist(entry: Entry) {
    const latest = entry.pending ?? entry.inFlight;
    const content =
      latest?.request.data ??
      entry.inFlight?.request.data ??
      entry.draft?.data ??
      entry.snapshot?.data;
    if (latest && content) {
      entry.draft = {
        id: entry.id,
        token: latest.token,
        data: copy(content),
        baseUpdatedAt: entry.baseUpdatedAt,
        updatedAt: new Date().toISOString(),
        sessionId: this.sessionId,
        title:
          latest.request.title ??
          entry.inFlight?.request.title ??
          entry.draft?.title ??
          entry.snapshot?.title,
        slug:
          latest.request.slug ??
          entry.inFlight?.request.slug ??
          entry.draft?.slug ??
          entry.snapshot?.slug,
        locked:
          latest.request.locked ??
          entry.inFlight?.request.locked ??
          entry.draft?.locked ??
          entry.snapshot?.locked,
      };
    }
    if (!entry.draft) return;
    try {
      if (this.storage.write(entry.draft).ok) entry.persistedToken = entry.draft.token;
    } catch {
      // A failed durable write never prevents a normal database save or destroys the in-memory copy.
    }
  }

  private publish(entry: Entry) {
    const active = [entry.pending, entry.inFlight].filter(
      (item): item is Pending => item !== undefined,
    );
    const metadataPending = active.some((item) =>
      Object.keys(item.request).some(
        (key) => !["id", "data", "updatedAt", "expectedUpdatedAt"].includes(key),
      ),
    );
    let status: ResumeSaveState["status"] = "saved";
    if (entry.pending) status = "pending";
    if (entry.inFlight) status = "saving";
    if (entry.error) status = "error";
    if (entry.conflict) status = "conflict";
    entry.state = {
      status,
      durable:
        !this.isDirty(entry) ||
        (!metadataPending && Boolean(entry.draft && entry.persistedToken === entry.draft.token)),
      draftUnavailable: Boolean(entry.draft && entry.persistedToken !== entry.draft.token),
      error: entry.error?.message,
    };
    for (const listener of this.listeners) listener();
  }

  private async flushEntry(entry: Entry): Promise<boolean> {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = undefined;
    if (entry.conflict) return false;
    while (entry.running ?? entry.pending) {
      const running = entry.running ?? Promise.resolve().then(() => this.drain(entry));
      entry.running = running;
      const saved = await running;
      if (entry.running === running) entry.running = undefined;
      if (!saved) return false;
    }
    return true;
  }

  private async drain(entry: Entry) {
    entry.error = undefined;
    while (entry.pending) {
      const submitted = entry.pending;
      entry.pending = undefined;
      entry.inFlight = submitted;
      this.publish(entry);
      try {
        if (!entry.baseUpdatedAt) throw new ResumeConflictError("RESUME_VERSION_REQUIRED");
        const response = await this.save({
          ...submitted.request,
          expectedUpdatedAt: new Date(entry.baseUpdatedAt),
        });
        entry.response = response;
        entry.snapshot = copy(response);
        entry.baseUpdatedAt = iso(response.updatedAt);
        if (entry.draft?.token === submitted.token) {
          try {
            await this.storage.remove(entry.id, submitted.token);
          } catch {
            // An acknowledged snapshot left on disk is recognized against server data during recovery.
          }
          if (this.getDraft(entry.id)?.token === submitted.token) entry.draft = undefined;
        }
        if (this.currentPending(entry)) this.persist(entry);
      } catch (error) {
        const pending = this.currentPending(entry);
        entry.pending = pending
          ? { ...pending, request: { ...submitted.request, ...pending.request } }
          : submitted;
        entry.error = error instanceof Error ? error : new Error(String(error));
        entry.conflict = error instanceof ResumeConflictError;
        this.persist(entry);
      } finally {
        entry.inFlight = undefined;
        this.publish(entry);
      }
      if (entry.error) return false;
    }
    return true;
  }

  private currentPending(entry: Entry): Pending | undefined {
    return entry.pending;
  }
}
