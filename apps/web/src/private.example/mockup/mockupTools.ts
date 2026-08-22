import type { MockupRenderResult } from '@/service/mockupTools';

export async function renderMockup(
  _image: string,
  _templateId = 'demo-cylinder'
): Promise<MockupRenderResult> {
  throw new Error('Install closed-source mockup UI under src/private/mockup');
}
