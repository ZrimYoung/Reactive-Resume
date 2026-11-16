import type { Resume } from "@prisma/client";
import type { ResumeData } from "@reactive-resume/schema";

import { parseTags } from "./resume-history";

export function decodeResume(resume: Resume) {
  return { ...resume, data: JSON.parse(resume.data) as ResumeData, tags: parseTags(resume.tags) };
}
