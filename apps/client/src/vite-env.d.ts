/// <reference types="vite/client" />
/* eslint-disable @typescript-eslint/consistent-type-definitions -- Window is a global interface augmentation. */
/* eslint-disable @typescript-eslint/consistent-type-imports -- Import type queries preserve this global declaration file. */

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Existing IPC accepts both parsed and serialized JSON.
    openJson: () => Promise<{ canceled: boolean; content?: any }>;
    writeResumeDraft: (draft: import("./services/resume/save-queue").ResumeDraft) => {
      ok: boolean;
      error?: string;
    };
    readResumeDraft: (
      id: string,
    ) => Promise<import("./services/resume/save-queue").ResumeDraft | null>;
    listResumeDrafts?: (
      id: string,
    ) => Promise<import("./services/resume/save-queue").ResumeDraft[]>;
    removeResumeDraft: (id: string, token: string) => Promise<void>;
    onBeforeClose: (handler: () => Promise<{ saved: boolean; durable: boolean }>) => () => void;
  };
}
