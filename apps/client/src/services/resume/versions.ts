import type { ResumeDto } from "@reactive-resume/dto";
import type { ResumeData } from "@reactive-resume/schema";

import { axios } from "@/client/libs/axios";
import { queryClient } from "@/client/libs/query-client";

import { cacheResumeRevision } from "./library";

export type ResumeVersion = {
  id: string;
  kind: "auto" | "named" | "before-restore";
  name: string | null;
  createdAt: Date | string;
};

export type ResumeVersionDetail = ResumeVersion & { data: ResumeData };

export const listResumeVersions = async (id: string, signal?: AbortSignal) => {
  const { data } = await axios.get<ResumeVersion[]>(`/resume/${id}/versions`, { signal });
  return data;
};

export const readResumeVersion = async (id: string, versionId: string, signal?: AbortSignal) => {
  const { data } = await axios.get<ResumeVersionDetail>(`/resume/${id}/versions/${versionId}`, {
    signal,
  });
  return data;
};

export const createResumeVersion = async (
  id: string,
  name: string,
  expectedUpdatedAt: Date | string,
) => {
  const { data } = await axios.post<ResumeVersion>(`/resume/${id}/versions`, {
    name,
    expectedUpdatedAt,
  });
  return data;
};

export const restoreResumeVersion = async (
  id: string,
  versionId: string,
  expectedUpdatedAt: Date | string,
) => {
  const { data } = await axios.post<ResumeDto>(`/resume/${id}/versions/${versionId}/restore`, {
    expectedUpdatedAt,
  });
  cacheResumeRevision(data);
  return data;
};

export const deleteSavedResumeVersion = async (id: string, versionId: string) => {
  await axios.delete(`/resume/${id}/versions/${versionId}`);
  queryClient.removeQueries({ queryKey: ["resume-history-detail", id, versionId] });
};
