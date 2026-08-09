/**
 * Asset register — list/delete via `apiClient.assets*`.
 */

import { apiClient } from '@/service/client';
import type { AssetKind, UserAsset } from '@/models/assets';

/** POST /api/v1/assets/register — canvas upload → Assets dock */
export const registerAsset = (data: {
  kind: Exclude<AssetKind, 'font'>;
  url: string;
  objectKey?: string | null;
  mime?: string | null;
  prompt?: string | null;
  width?: number | null;
  height?: number | null;
  source?: string | null;
}) =>
  apiClient.assetsRegisterMyAsset({
    body: {
      kind: data.kind,
      url: data.url,
      ...(data.objectKey ? { objectKey: data.objectKey } : {}),
      ...(data.mime ? { mime: data.mime } : {}),
      ...(data.prompt ? { prompt: data.prompt } : {}),
      ...(data.width != null ? { width: data.width } : {}),
      ...(data.height != null ? { height: data.height } : {}),
      source: data.source || 'upload',
    },
  }) as Promise<UserAsset>;

export type { AssetKind, UserAsset } from '@/models/assets';
