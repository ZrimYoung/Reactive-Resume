import type { Resume } from "@prisma/client";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      payload?: {
        resume: Resume;
      };
    }
  }
}

export {};
