/**
 * Closed-source product mockup — only when Recombyn Intelligence is configured.
 * OSS-only deploys omit mockup from capabilities; UI and BFF stay disabled.
 */

import { getHttpErrorMessage } from '@/service/client';
import { getApiBaseUrl } from '@/utils/apiBase';
import { getToken } from '@/utils/token';
import type { ImageToolCapabilities } from '@/service/imageTools';

export type MockupRenderResult = {
  image: string;
  kind: string;
  template_id?: string;
  width?: number;
  height?: number;
  engines?: string[];
  warnings?: string[];
};

export function isMockupEnabled(caps?: ImageToolCapabilities | null): boolean {
  return caps?.mockup?.enabled === true;
}

export async function renderMockup(
  image: string,
  templateId = 'demo-cylinder'
): Promise<MockupRenderResult> {
  const base = getApiBaseUrl().replace(/\/$/, '');
  const token = getToken();
  const res = await fetch(`${base}/api/v1/mockup/render`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ image, template_id: templateId }),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = String(body?.detail || '');
    } catch {
      detail = await res.text();
    }
    throw new Error(detail || `mockup render failed (${res.status})`);
  }
  return (await res.json()) as MockupRenderResult;
}

export function mockupErrorMessage(err: unknown, fallback: string): string {
  return getHttpErrorMessage(err, fallback);
}
