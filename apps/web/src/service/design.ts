/**
 * Backend table-driven design job client (agent / single_model / partial).
 */

import { z } from 'zod';
import { abortAfter, apiClient, apiQuery, queryClient } from '@/service/client';
import { request } from '@/utils/request';
import { sse } from '@/utils/sse';

export type DesignRunMode = 'agent' | 'single_model' | 'partial';
export type DesignScene = 'website' | 'mobile' | 'image' | 'poster' | 'drawing' | 'video';

export type DesignCatalog = {
  scenes: DesignScene[];
  models: Array<{ id: string; label: string }>;
  style_groups: Array<{
    id: number;
    name: string;
    scenes: string;
    skill_ids: number[];
    priority: number;
  }>;
  prompt_stack?: string[];
  flows: Record<string, { id: number; scene: string; skill_ids: number[] }>;
  /** Enabled canvas tool_ops from design_canvas_tool — FE executes by op_key. */
  canvas_tools?: Array<{
    op_key: string;
    kind?: string;
    label?: string;
    model_hint?: string;
    args_schema?: string;
    enabled?: boolean;
    sort_order?: number;
  }>;
  /** Platform Admin global rules (includes precheck.user_preset.*). */
  global_rules?: Record<string, string>;
};

export type DesignSvgPatch = {
  mode: 'full' | 'patch';
  creates: string[];
  updates: string[];
  deletes: string[];
  create_count: number;
  update_count: number;
  delete_count: number;
  total_next?: number;
};

export type DesignJobEvent =
  | {
      type: 'status';
      task_id?: string;
      status?: string;
      hold_credits?: number;
      scene?: string;
      canvas_width?: number;
      canvas_height?: number;
      canvas_size?: string;
      edit_in_place?: boolean;
      blank_artboard?: boolean;
      /** Host should open a new artboard (WxH) then paint content into it. */
      open_artboard?: boolean;
      intent?: string;
    }
  | {
      type: 'permission';
      can_call_llm: boolean;
      balance?: number;
      need?: number;
      free_daily?: boolean;
    }
  | { type: 'thinking'; text: string; replace?: boolean }
  | { type: 'token'; text?: string; code?: string; params?: Record<string, string> }
  | { type: 'chat_done' }
  | {
      type: 'skill_start';
      index: number;
      skill_id: number;
      skill_name: string;
      category?: string;
      model?: string;
      model_reason?: string;
    }
  | {
      /** Live execute progress (chars received) while model streams tool JSON. */
      type: 'skill_progress';
      index: number;
      skill_id?: number;
      skill_name?: string;
      chars?: number;
    }
  | {
      type: 'skill_done';
      index: number;
      skill_id: number;
      skill_name: string;
      tokens?: number;
      /** Full SVG after this skill — kept for paint / fallback. */
      preview_svg?: string;
      /** Layer-level create/update/delete vs previous emitted SVG. */
      svg_patch?: DesignSvgPatch;
      /** User-facing intent analysis from req_parse / plan skill. */
      analysis?: string;
      tool_ops?: Array<{ name: string; args?: Record<string, unknown> }>;
    }
  | {
      /** Model intent / requirements analysis (from plan skill JSON). */
      type: 'analysis';
      text: string;
      skill_id?: number;
      skill_name?: string;
    }
  | {
      /** Streaming analysis tokens (plan / req_parse). */
      type: 'analysis_delta';
      text: string;
      skill_id?: number;
      skill_name?: string;
    }
  | {
      /** Backend-authored progress (element counts etc.). FE displays, does not invent. */
      type: 'activity';
      id?: string;
      kind?: 'thought' | 'added' | 'updated' | 'explored' | 'skipped' | 'tool';
      status?: 'running' | 'done' | 'error';
      count?: number;
      detail?: string;
      skillName?: string;
      skill_name?: string;
      durationSec?: number;
      index?: number;
      stage?: string;
      /** Stable kernel code for FE i18n (e.g. ops_validate_failed). */
      code?: string;
      /** Nested Explored line. */
      item?: { id?: string; name?: string; summary?: string };
      /** Markdown body for expandable Explored (diagrams / notes). */
      body?: string;
    }
  | {
      /** Dedicated incremental SVG push (optional; skill_done.preview_svg also works). */
      type: 'svg_delta';
      svg: string;
      index?: number;
      skill_name?: string;
      svg_patch?: DesignSvgPatch;
    }
  | {
      type: 'decision';
      trace_id?: string;
      route?: string;
      fast_path?: boolean;
      intent?: string;
      edit_in_place?: boolean;
      blank_artboard?: boolean;
      focus_frame_id?: string;
      memory_injected?: boolean;
      memory_blocks_chars?: number;
      has_target_chip?: boolean;
      has_scene_nodes?: boolean;
      [key: string]: unknown;
    }
  | {
      type: 'result';
      task_id: string;
      trace_id?: string;
      status: string;
      svg: string;
      charged_credits?: number;
      total_tokens?: number;
      actual_models?: unknown[];
      summary?: string;
      choices?: string[];
      proposed_ops?: Array<{
        name?: string;
        args?: Record<string, unknown>;
        op_id?: string;
      }>;
      apply_choice?: string;
      /** Ask interaction format: confirm | single | multi | buttons | text. */
      choice_ui?: {
        mode?: string;
        options?: Array<{ label?: string; action?: string }>;
        placeholder?: string;
        hint?: string;
      };
      scene?: string;
      canvas_width?: number;
      canvas_height?: number;
      canvas_size?: string;
      svg_patch?: DesignSvgPatch;
      tool_ops_applied?: boolean;
      blank_artboard?: boolean;
      intent?: string;
      decision_log?: Record<string, unknown>;
    }
  | {
      type: 'tool_ops';
      ops: Array<{ name: string; args?: Record<string, unknown>; op_id?: string }>;
      schema_version?: string;
      index?: number;
      skill_id?: number;
      skill_name?: string;
      /** True when ops are pushed mid-stream (边想边画). */
      stream?: boolean;
      agent_round?: number;
    }
  | {
      type: 'scene_feedback_request';
      task_id?: string;
      round?: number;
      rounds?: number;
      wait_ms?: number;
    }
  | { type: 'critique_start'; round: number; reason?: string }
  | {
      type: 'critique_done';
      round: number;
      ok: boolean;
      reason?: string;
      source?: string;
      issues?: string[];
      strengths?: string[];
      weaknesses?: string[];
      market_gap?: string;
    }
  | {
      type: 'memory_patch';
      medium: Record<string, unknown>;
      long_suggestions?: Array<{ kind: string; text: string }>;
    }
  | { type: 'replan'; action: string; skipped?: string[]; reason?: string }
  | { type: 'subgoals'; goals: string[] }
  | {
      type: 'error';
      code: string;
      message?: string;
      task_id?: string;
      refunded_credits?: number;
      resumable?: boolean;
    }
  | {
      type: 'paused';
      task_id?: string;
      trace_id?: string;
      resumable?: boolean;
      interrupt_kind?: string;
      message?: string;
      resume_token?: string;
    }
  | {
      type: 'cancelled';
      task_id?: string;
      trace_id?: string;
      refunded_credits?: number;
    }
  | {
      type: 'status';
      task_id?: string;
      trace_id?: string;
      resumed?: boolean;
      status?: string;
      [key: string]: unknown;
    };

/** Known wire `type` values — boundary check before casting to DesignJobEvent. */
const DESIGN_JOB_EVENT_TYPES = [
  'status',
  'permission',
  'thinking',
  'token',
  'chat_done',
  'skill_start',
  'skill_progress',
  'skill_done',
  'analysis',
  'analysis_delta',
  'activity',
  'svg_delta',
  'decision',
  'result',
  'tool_ops',
  'scene_feedback_request',
  'critique_start',
  'critique_done',
  'memory_patch',
  'replan',
  'subgoals',
  'error',
  'paused',
  'cancelled',
] as const;

const designJobEventSchema = z
  .object({
    type: z.enum(DESIGN_JOB_EVENT_TYPES),
  })
  .passthrough();

/** Parse one SSE JSON payload; null when malformed or unknown `type`. */
export function parseDesignJobEvent(raw: unknown): DesignJobEvent | null {
  const parsed = designJobEventSchema.safeParse(raw);
  if (!parsed.success) return null;
  return parsed.data as DesignJobEvent;
}

export type DesignRunStatus = {
  task_id: string;
  status: string;
  resumable: boolean;
  hold_credits?: number;
  charged_credits?: number;
  error_message?: string | null;
  thread_id?: string;
  interrupt_kind?: string | null;
  checkpoint_at?: number | null;
  resume_token?: string | null;
  updated_at?: number;
};

export type RunDesignJobBody = {
  run_mode: DesignRunMode;
  prompt: string;
  /** agent = auto paint; ask = propose / clarify first (same LangGraph). */
  interaction_mode?: 'agent' | 'ask';
  /** ops = default tool_ops graph; img_layers = generate board then split layers. */
  paint_mode?: 'ops' | 'img_layers';
  scene?: DesignScene | null;
  style_group_id?: number;
  user_selected_model?: string;
  route_overrides?: Record<string, string>;
  canvas_id?: string;
  canvas_size?: string;
  ref_image_sizes?: string[];
  target_layer_id?: string;
  layer_ids?: string[];
  current_svg?: string;
  scene_nodes?: Array<Record<string, unknown>>;
  scene_frames?: Array<Record<string, unknown>>;
  spatial_summary?: Record<string, unknown>;
  focus_frame_id?: string;
  images?: string[];
  session_id?: string;
  project_id?: string;
  memory?: {
    medium: Record<string, unknown>;
    short?: Array<{ role: string; text: string }>;
    retrieve_long?: boolean;
  };
  /** Ask confirm: apply previously proposed tool_ops without a new LLM plan. */
  apply_ops?: Array<{ name?: string; args?: Record<string, unknown>; op_id?: string }>;
  /** Bind confirm to design_task.meta.ask_proposal. */
  proposal_id?: string;
  proposal_task_id?: string;
  /** User-pinned skills from `/` chips (skill keys or ids). */
  skill_refs?: string[];
};

export type DesignSkillCard = {
  id: number;
  skillKey?: string | null;
  qualifiedKey?: string | null;
  name: string;
  description?: string;
  whenToUse?: string;
  logo?: string | null;
  namespace?: string;
  source?: string;
  ownerUserId?: string | null;
  category?: string;
  mine?: boolean;
  enabled?: boolean;
  promptPositive?: string;
  promptNegative?: string;
  triggers?: Array<Record<string, unknown> | string>;
};

export type DesignSkillsPickerResult = { items?: DesignSkillCard[] };

export function invalidateDesignCatalogCache() {
  void queryClient.invalidateQueries({ queryKey: apiQuery.designDesignCatalog.key() });
}

/** GET /design/catalog — shared Query cache (AgentDock / Models / warm). */
export async function fetchDesignCatalog(opts?: { force?: boolean }): Promise<DesignCatalog> {
  if (opts?.force) {
    return queryClient.fetchQuery({
      ...apiQuery.designDesignCatalog.queryOptions(),
      staleTime: 0,
    }) as Promise<DesignCatalog>;
  }
  return queryClient.ensureQueryData({
    ...apiQuery.designDesignCatalog.queryOptions(),
    staleTime: 60_000,
  }) as Promise<DesignCatalog>;
}

/** GET /design/skills/picker — shared Query cache. */
export async function fetchDesignSkillsPicker(opts?: {
  force?: boolean;
}): Promise<DesignSkillsPickerResult> {
  const input = { query: {} };
  if (opts?.force) {
    return queryClient.fetchQuery({
      ...apiQuery.designDesignSkillsPicker.queryOptions({ input }),
      staleTime: 0,
    }) as Promise<DesignSkillsPickerResult>;
  }
  return queryClient.ensureQueryData({
    ...apiQuery.designDesignSkillsPicker.queryOptions({ input }),
    staleTime: 60_000,
  }) as Promise<DesignSkillsPickerResult>;
}

export type SseHandlers = {
  onmessage?: (ev: { event: string; data: string }) => void;
  onerror?: (err: Error) => void;
  onopen?: (response: Response) => Promise<void>;
  onclose?: () => void;
  signal?: AbortSignal;
};

/** POST /design/run SSE — callers parse `ev.data` as DesignJobEvent. */
export const runDesignJob = (body: RunDesignJobBody, config: SseHandlers = {}) =>
  sse({
    url: '/api/v1/design/run',
    method: 'POST',
    body,
    signal: config.signal,
    onopen: config.onopen,
    onmessage: config.onmessage,
    onerror: config.onerror,
    onclose: config.onclose,
  });

/** GET /design/run/{taskId} — pause/resume status. */
export const fetchDesignRunStatus = (taskId: string, signal?: AbortSignal) =>
  apiClient.designDesignRunStatus(
    { params: { task_id: taskId } },
    { signal: abortAfter(15_000, signal) }
  ) as Promise<DesignRunStatus>;

/** POST /design/run/{taskId}/pause — keep LangGraph checkpoint. */
export const pauseDesignRun = (taskId: string, signal?: AbortSignal) =>
  apiClient.designDesignRunPause(
    { params: { task_id: taskId } },
    { signal: abortAfter(15_000, signal) }
  ) as Promise<{ ok?: boolean; status?: string; error?: string; already?: boolean }>;

/** POST /design/run/{taskId}/resume SSE — continue from checkpoint. */
export const resumeDesignJob = (
  taskId: string,
  body: { resume_token?: string | null } = {},
  config: SseHandlers = {}
) =>
  sse({
    url: `/api/v1/design/run/${encodeURIComponent(taskId)}/resume`,
    method: 'POST',
    body,
    signal: config.signal,
    onopen: config.onopen,
    onmessage: config.onmessage,
    onerror: config.onerror,
    onclose: config.onclose,
  });

/** After tool_ops paint: push real canvas inventory for the next agent round. */
export const postDesignSceneFeedback = (
  taskId: string,
  data: {
    scene_nodes: Array<Record<string, unknown>>;
    scene_frames?: Array<Record<string, unknown>>;
    spatial_summary?: Record<string, unknown>;
    op_results?: Array<{ op_id: string; name: string; ok: boolean; error?: string }>;
    /** JPEG/PNG data URL of focus artboard for CLIP critique. */
    preview_image?: string;
    round?: number;
  },
  signal?: AbortSignal
) =>
  apiClient.designDesignRunSceneFeedback(
    { params: { task_id: taskId }, body: data as never },
    { signal: abortAfter(30_000, signal) }
  ) as Promise<{ ok?: boolean; count?: number; frames?: number }>;

export type GenerateLottieInput = {
  prompt: string;
  width?: number;
  height?: number;
  duration_sec?: number;
  model?: string;
  /** Reference images (data URL / https) — requires a vision-capable model. */
  images?: string[];
};

export type GenerateLottieResult = {
  animationData: Record<string, unknown>;
  w?: number;
  h?: number;
};

/** POST /design/lottie/generate — Bodymovin JSON for the on-canvas Lottie plate. */
export const generateLottie = (
  data: GenerateLottieInput,
  opts?: { signal?: AbortSignal }
) =>
  apiClient.designDesignLottieGenerate(
    { body: data as never },
    { signal: abortAfter(90_000, opts?.signal) }
  ) as Promise<GenerateLottieResult>;

export type DesignSkillImportExisting = {
  id: number;
  name: string;
  skillKey?: string | null;
  packVersion?: string | null;
  updatedAt?: number | null;
  useCount?: number;
  mine?: boolean;
};

export type DesignSkillImportResult = {
  status: 'ok' | 'exists' | 'rejected';
  fileName?: string;
  scan?: {
    ok?: boolean;
    checks?: Array<{ id?: string; ok?: boolean; label?: string; detail?: string }>;
    errors?: string[];
  };
  item?: DesignSkillCard | null;
  existing?: DesignSkillImportExisting | null;
};

/** Upload a skill / plugin pack (``.zip`` or ``.recombyn-plugin``). */
export const importDesignSkillZip = (file: File, opts?: { overwrite?: boolean }) => {
  const data = new FormData();
  data.append('file', file);
  data.append('overwrite', opts?.overwrite ? 'true' : 'false');
  return request<DesignSkillImportResult>({
    url: '/api/v1/design/skills/import',
    method: 'post',
    data,
    timeout: 120000,
  });
};

/** Install a branded ``.recombyn-plugin`` (skill → user DB; canvas → disk when enabled). */
export const installRecombynPlugin = (file: File, opts?: { overwrite?: boolean }) => {
  const data = new FormData();
  data.append('file', file);
  data.append('overwrite', opts?.overwrite ? 'true' : 'false');
  return request<DesignSkillImportResult>({
    url: '/api/v1/design/plugins/install',
    method: 'post',
    data,
    timeout: 120000,
  });
};
