/**
 * Chat / LLM API — models + image gen.
 */

import { abortAfter, apiClient, apiQuery, queryClient } from '@/service/client';
import { request } from '@/utils/request';

export type ModelReferenceType = 'text' | 'vision' | 'image';

/** From admin catalog `imageLimits` (Seedream WxH / OpenRouter resolution). */
export type ImageLimits = {
  preset?: string;
  transport?: string;
  min_pixels?: number;
  max_pixels?: number;
  resolutions?: string[];
  default_resolution?: string;
  aspect_ratios?: string[];
  size_tables?: Record<string, Record<string, string>>;
  supports_output_format?: boolean;
  supports_quality?: boolean;
};

/** Catalog price provenance (OpenRouter sync / Ark docs). */
export type ImagePriceMeta = {
  source?: string;
  billing?: string;
  unit?: string;
  usd_per_output_token?: number;
  fx_usd_cny?: number;
  base_resolution?: string;
  price_by_resolution_cny?: Record<string, number | string>;
  price_by_resolution?: Record<string, number | string>;
  output_image?: number;
  output_image_high?: number;
  high_pixels_threshold?: number;
  note?: string;
};

export type LlmModel = {
  id: string;
  label: string;
  provider: string;
  description?: string | null;
  kind?: 'text' | 'image' | 'svg' | 'video' | 'audio';
  referenceTypes?: ModelReferenceType[];
  reference_types?: ModelReferenceType[];
  thinking?: boolean;
  enabled?: boolean;
  iconUrl?: string | null;
  icon_url?: string | null;
  iconKey?: string | null;
  icon_key?: string | null;
  price?: string | null;
  priceMeta?: ImagePriceMeta | null;
  price_meta?: ImagePriceMeta | null;
  maxAttachments?: number;
  max_attachments?: number;
  imageLimits?: ImageLimits | null;
  image_limits?: ImageLimits | null;
};

/** Default generation params carried by image/video preset models. */
export type ByokPresetDefaults = {
  aspectRatios?: string[];
  resolutions?: string[];
  defaultResolution?: string;
  durations?: number[];
  defaultDuration?: number;
};

/** One selectable model under a legacy per-endpoint preset. */
export type ByokPresetModel = {
  apiModel: string;
  label: string;
  kind: 'text' | 'vision' | 'image' | 'video' | 'audio';
  thinking?: boolean;
  defaults?: ByokPresetDefaults;
};

/** Aggregator platform — one API key unlocks catalog models for that provider. */
export type ByokPlatform = {
  id: string;
  name: string;
  baseUrl: string;
  website?: string;
  iconKey?: string;
  kinds: Array<'text' | 'vision' | 'image' | 'video'>;
  /** Stable vault id, e.g. ``platform:openrouter``. */
  rowId: string;
  hint?: string;
};

/** @deprecated Prefer ByokPlatform — older ``byokPresets`` field. */
export type ByokPresetProvider = ByokPlatform & {
  models?: ByokPresetModel[];
};

export type ChatModelsResponse = {
  models: LlmModel[];
  available: boolean;
  imageModels?: LlmModel[];
  videoModels?: LlmModel[];
  audioModels?: LlmModel[];
  /** ISO country from GeoLite2 / edge headers when known. */
  clientRegion?: string | null;
  /** False on CN (and other blocked) networks — OpenRouter catalog hidden. */
  openrouterAvailable?: boolean;
  /** Aggregator platforms (OpenRouter / Volcengine) — one key unlocks catalog models. */
  byokPlatforms?: ByokPlatform[];
  /** Alias of byokPlatforms for older clients. */
  byokPresets?: ByokPresetProvider[];
};

export type GenerateImageInput = {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  quality?: string;
  resolution?: string;
  images?: string[];
};

export type GenerateImageResult = {
  images: string[];
  text?: string | null;
  model: string;
  assets?: Array<{ url?: string | null; id?: string | null }> | null;
};

/** GET /api/v1/chat/models — Query-cached via oRPC. */
export function invalidateChatModelsCache() {
  void queryClient.invalidateQueries({ queryKey: apiQuery.chatGetModels.key() });
}

export async function listModels(opts?: { force?: boolean }): Promise<ChatModelsResponse> {
  if (opts?.force) {
    return queryClient.fetchQuery({
      ...apiQuery.chatGetModels.queryOptions(),
      staleTime: 0,
    }) as Promise<ChatModelsResponse>;
  }
  return queryClient.ensureQueryData({
    ...apiQuery.chatGetModels.queryOptions(),
    staleTime: 60_000,
  }) as Promise<ChatModelsResponse>;
}

type ImageJobCreate = {
  job_id: string;
  status: 'queued';
};

type ImageJobState = {
  job_id: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  progress?: number;
  result?: GenerateImageResult | null;
  error?: string | null;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function waitForImageJob(
  jobId: string,
  opts?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<GenerateImageResult> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (opts?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }
    const job = await request<ImageJobState>({
      url: `/api/v1/chat/image/jobs/${encodeURIComponent(jobId)}`,
      method: 'get',
      skipInflightDedupe: true,
      signal: opts?.signal,
    });
    if (job.status === 'done') {
      const result = job.result;
      if (!result || !Array.isArray(result.images)) {
        throw new Error(job.error || 'image job missing result');
      }
      return result;
    }
    if (job.status === 'failed') {
      throw new Error(job.error || 'image generation failed');
    }
    await sleep(800);
  }
  throw new Error('image generation timed out');
}

/** POST /api/v1/chat/image/jobs + poll (keeps API workers free). */
export async function generateImage(
  data: GenerateImageInput,
  opts?: { signal?: AbortSignal },
): Promise<GenerateImageResult> {
  const signal = abortAfter(180_000, opts?.signal);
  const created = await request<ImageJobCreate>({
    url: '/api/v1/chat/image/jobs',
    method: 'post',
    data,
    signal,
  });
  return waitForImageJob(created.job_id, { signal });
}

export type GenerateVideoInput = {
  prompt: string;
  model?: string;
  aspect_ratio?: string;
  resolution?: string;
  duration?: number;
  /** First-frame / style reference images (data URLs or http URLs). */
  images?: string[];
};

export type GenerateVideoResult = {
  videos: string[];
  text?: string | null;
  model: string;
  assets?: Array<{ url?: string | null; id?: string | null }> | null;
};

/** POST /api/v1/chat/video — generation may take minutes (submit + poll on the API side). */
export const generateVideo = (
  data: GenerateVideoInput,
  opts?: { signal?: AbortSignal }
) =>
  apiClient.chatPostVideo(
    { body: data as never },
    { signal: abortAfter(600_000, opts?.signal) }
  ) as Promise<GenerateVideoResult>;

export type GenerateAudioInput = {
  prompt: string;
  model?: string;
  voice?: string;
  response_format?: string;
  speed?: number;
};

export type GenerateAudioResult = {
  audios: string[];
  model: string;
  voice?: string;
  mime?: string;
  assets?: Array<{ url?: string | null; id?: string | null }> | null;
};

/** POST /api/v1/chat/audio — OpenRouter TTS / speech. */
export const generateAudio = (
  data: GenerateAudioInput,
  opts?: { signal?: AbortSignal }
) =>
  apiClient.chatPostAudio(
    { body: data as never },
    { signal: abortAfter(180_000, opts?.signal) }
  ) as Promise<GenerateAudioResult>;
