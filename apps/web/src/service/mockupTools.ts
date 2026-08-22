/**
 * Mockup capability helpers (OSS-safe).
 * Render implementation lives in src/private/mockup — not committed to GitHub.
 */

import { getHttpErrorMessage } from '@/service/client';
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
  const mod = await import(/* @vite-ignore */ '@/private/mockup/mockupTools').catch(() => null);
  if (!mod?.renderMockup) {
    throw new Error('Mockup UI package not installed (copy src/private.example/mockup → src/private/mockup)');
  }
  return mod.renderMockup(image, templateId);
}

export function mockupErrorMessage(err: unknown, fallback: string): string {
  return getHttpErrorMessage(err, fallback);
}
