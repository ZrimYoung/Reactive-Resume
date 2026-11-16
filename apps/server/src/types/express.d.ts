import type { ResumeDto } from "@reactive-resume/dto";

declare global {
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Request {
      payload?: {
        resume: ResumeDto;
      };
    }
  }
}

export {};
