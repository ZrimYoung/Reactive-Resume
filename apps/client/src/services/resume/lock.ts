import type { ResumeDto } from "@reactive-resume/dto";
import { useMutation } from "@tanstack/react-query";

import { queryClient } from "@/client/libs/query-client";

import { updateResume } from "./update";

type LockResumeArgs = {
  id: string;
  set: boolean;
  updatedAt: Date;
};

export const lockResume = async ({ id, set, updatedAt }: LockResumeArgs) => {
  const response = await updateResume({ id, locked: set, updatedAt });

  queryClient.setQueryData<ResumeDto[]>(["resumes"], (cache) => {
    if (!cache) return [response];
    return cache.map((resume) => {
      if (resume.id === response.id) return response;
      return resume;
    });
  });

  return response;
};

export const useLockResume = () => {
  const {
    error,
    isPending: loading,
    mutateAsync: lockResumeFn,
  } = useMutation({
    mutationFn: lockResume,
  });

  return { lockResume: lockResumeFn, loading, error };
};
