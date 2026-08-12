/**
 * Async artboard export jobs (PNG/PDF via Celery).
 * Multipart-free JSON + blob download — not on the generated oRPC contract yet.
 */

import { request } from '@/utils/request';
import { resolveApiUrl } from '@/utils/apiBase';
import { getToken } from '@/utils/token';

export type ExportJobFormat = 'png' | 'pdf';

export type ExportJobStatus = 'queued' | 'processing' | 'done' | 'failed';

export type ExportJobCreate = {
  job_id: string;
  status: 'queued';
  trace_id?: string;
};

export type ExportJobState = {
  job_id: string;
  status: ExportJobStatus;
  progress?: number;
  result?: {
    key?: string;
    url?: string;
    contentType?: string;
    pages?: number;
    format?: string;
  } | null;
  error?: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function createExportJob(body: {
  projectId: string;
  format: ExportJobFormat;
  frameId?: string | null;
}) {
  return request<ExportJobCreate>({
    url: '/api/v1/design/export/jobs',
    method: 'post',
    data: {
      projectId: body.projectId,
      format: body.format,
      frameId: body.frameId || undefined,
    },
  });
}

export async function getExportJob(jobId: string) {
  return request<ExportJobState>({
    url: `/api/v1/design/export/jobs/${encodeURIComponent(jobId)}`,
    method: 'get',
    skipInflightDedupe: true,
  });
}

export async function downloadExportJobFile(jobId: string): Promise<Blob> {
  const token = getToken();
  const url = resolveApiUrl(`/api/v1/design/export/jobs/${encodeURIComponent(jobId)}/file`);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`export download failed (${res.status})`);
  }
  return res.blob();
}

export async function waitForExportJob(
  jobId: string,
  opts?: { timeoutMs?: number; intervalMs?: number },
): Promise<ExportJobState> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const intervalMs = opts?.intervalMs ?? 800;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const job = await getExportJob(jobId);
    if (job.status === 'done') return job;
    if (job.status === 'failed') {
      throw new Error(job.error || 'export failed');
    }
    await sleep(intervalMs);
  }
  throw new Error('export timed out');
}
