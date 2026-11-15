/// <reference types="vite/client" />

declare const appVersion: string;

// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  electron: {
    isElectron: true;
    downloadAndSave: (
      url: string,
      filename: string,
    ) => Promise<{ canceled: boolean; filePath?: string }>;
    openJson: () => Promise<{ canceled: boolean; content?: any }>;
    writeResumeDraft: (draft: {
      id: string;
      token: string;
      data: import("@reactive-resume/schema").ResumeData;
      baseUpdatedAt: string;
      updatedAt: string;
    }) => { ok: boolean; error?: string };
    readResumeDraft: (id: string) => Promise<{
      id: string;
      token: string;
      data: import("@reactive-resume/schema").ResumeData;
      baseUpdatedAt: string;
      updatedAt: string;
    } | null>;
    removeResumeDraft: (id: string, token: string) => Promise<void>;
    onBeforeClose: (handler: () => Promise<{ saved: boolean; durable: boolean }>) => () => void;
  };
}
