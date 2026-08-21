/**
 * Project version history API (named + auto snapshots).
 */

import { request } from '@/utils/request';

export type ProjectVersionKind = 'named' | 'auto';

export type ProjectVersionDto = {
  id: string;
  projectId: string;
  name: string;
  note?: string | null;
  kind: ProjectVersionKind;
  sourceRevision: number;
  thumbnailUrl?: string | string[] | null;
  createdAt: number;
  document?: unknown;
};

export type ProjectVersionList = {
  items: ProjectVersionDto[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
};

export type RestoreProjectVersionResult = {
  project: {
    id: string;
    name: string;
    revision?: number;
    thumbnailUrl?: string | string[] | null;
    updatedAt?: number;
  };
  document: unknown;
  restoredVersion: ProjectVersionDto;
  backupVersion?: ProjectVersionDto | null;
};

export function listProjectVersionsApi(
  projectId: string,
  opts?: { kind?: ProjectVersionKind; page?: number; pageSize?: number; signal?: AbortSignal }
) {
  const q = new URLSearchParams();
  if (opts?.kind) q.set('kind', opts.kind);
  if (opts?.page) q.set('page', String(opts.page));
  if (opts?.pageSize) q.set('pageSize', String(opts.pageSize));
  const qs = q.toString();
  return request<ProjectVersionList>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/versions${qs ? `?${qs}` : ''}`,
    method: 'GET',
    signal: opts?.signal,
  });
}

export function createProjectVersionApi(
  projectId: string,
  body: {
    name?: string;
    note?: string;
    kind?: ProjectVersionKind;
    document?: unknown;
  }
) {
  return request<{ version: ProjectVersionDto }>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/versions`,
    method: 'POST',
    data: body,
  });
}

export function getProjectVersionApi(projectId: string, versionId: string) {
  return request<{ version: ProjectVersionDto }>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
    method: 'GET',
  });
}

export function patchProjectVersionApi(
  projectId: string,
  versionId: string,
  body: { name?: string; note?: string }
) {
  return request<{ version: ProjectVersionDto }>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
    method: 'PATCH',
    data: body,
  });
}

export function deleteProjectVersionApi(projectId: string, versionId: string) {
  return request<{ ok: boolean }>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}`,
    method: 'DELETE',
  });
}

export function restoreProjectVersionApi(
  projectId: string,
  versionId: string,
  body: { baseRevision?: number | null; createBackup?: boolean }
) {
  return request<RestoreProjectVersionResult>({
    url: `/api/v1/projects/${encodeURIComponent(projectId)}/versions/${encodeURIComponent(versionId)}/restore`,
    method: 'POST',
    data: body,
  });
}
