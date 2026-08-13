import type { Store } from '@reduxjs/toolkit';
import { message } from '@/components/base';
import type { DesignScene } from '@/service/design';
import {
  applyActivityEventToSteps,
  applyAnalysisDeltaToSteps,
  applyThinkingBodyToSteps,
  buildChatProcessSteps,
  formatActivityLabel,
  localizeExploreItem,
  normalizeActivityStatus,
  type ChatUiMessage,
} from '@/components/editor/panels/agent/ChatTurnList';
import {
  type AgentStepEvent,
  type DesignIntelligencePatch,
} from '@/components/editor/panels/agent/runDesignAgent';
import type { DesignSendMutable } from '@/components/editor/panels/agent/agentSendPath';

type TFn = (key: string, opts?: Record<string, unknown>) => string;

export function mergeDesignIntelligence(
  prev: DesignIntelligencePatch | undefined,
  patch: DesignIntelligencePatch
): DesignIntelligencePatch {
  const next: DesignIntelligencePatch = { ...(prev || {}) };
  if (patch.reference) {
    next.reference = { ...(prev?.reference || {}), ...patch.reference };
    if (patch.reference.dna) {
      next.reference.dna = { ...(prev?.reference?.dna || {}), ...patch.reference.dna };
    }
  }
  if (patch.review) {
    next.review = { ...(prev?.review || {}), ...patch.review };
  }
  if (patch.diff) {
    next.diff = { ...(prev?.diff || {}), ...patch.diff };
  }
  if (patch.summary) {
    next.summary = { ...(prev?.summary || {}), ...patch.summary };
  }
  if (patch.iterations?.length) {
    const byKey = new Map<string, NonNullable<DesignIntelligencePatch['iterations']>[number]>();
    for (const row of prev?.iterations || []) {
      byKey.set(`${row.iteration}:${row.overall}`, row);
    }
    for (const row of patch.iterations) {
      const key =
        row.overall > 0
          ? `${row.iteration}:${row.overall}`
          : `d:${row.iteration}:${row.decision || ''}`;
      const prevRow = byKey.get(`${row.iteration}:${row.overall}`) || byKey.get(key);
      byKey.set(key, { ...(prevRow || {}), ...row });
    }
    next.iterations = Array.from(byKey.values()).sort(
      (a, b) => a.iteration - b.iteration || a.overall - b.overall
    );
  }
  return next;
}

const DETAIL_SUMMARY_KINDS = new Set([
  'tool',
  'skipped',
  'added',
  'updated',
  'deleted',
]);
const SUCCESS_VARIANT_KINDS = new Set(['added', 'updated', 'deleted']);
const CONFIRM_VARIANT_KINDS = new Set(['thought', 'explored', 'tool']);

function activityRowSummary(opts: {
  kind: string;
  label: string;
  detailText: string;
  summaryText: string;
  bodyText?: string;
}): string | undefined {
  const { kind, label, detailText, summaryText, bodyText } = opts;
  const body = (bodyText || '').trim();
  if (summaryText && summaryText !== label && summaryText !== body) {
    return summaryText;
  }
  if (!DETAIL_SUMMARY_KINDS.has(kind)) return undefined;
  if (detailText && detailText !== label && detailText !== body) return detailText;
  return undefined;
}

function activityRowVariant(
  status: 'running' | 'done' | 'error',
  kind: string
): 'success' | 'confirm' | undefined {
  if (status === 'error') return undefined;
  if (SUCCESS_VARIANT_KINDS.has(kind)) return 'success';
  if (CONFIRM_VARIANT_KINDS.has(kind)) return 'confirm';
  return undefined;
}

function activityNestItem(
  t: TFn,
  item: { id?: string; name?: string; summary?: string } | undefined
) {
  if (!item || !(item.name || item.id)) return null;
  return localizeExploreItem(t, {
    id: String(item.id || `item-${Date.now()}`),
    name: String(item.name || '').trim() || '…',
    summary: item.summary ? String(item.summary) : undefined,
  });
}

type FinishAssistant = (
  m: ChatUiMessage,
  patch?: Partial<ChatUiMessage>
) => ChatUiMessage;

function patchChatDoneAssistant(
  m: ChatUiMessage,
  opts: {
    t: TFn;
    finish: FinishAssistant;
    choices?: string[];
    proposedOps?: ChatUiMessage['proposedOps'];
    proposalId?: string;
    applyChoice?: string;
    choiceUi?: ChatUiMessage['choiceUi'];
  }
): ChatUiMessage {
  return opts.finish(m, {
    content: (m.content || '').trim(),
    thinking: undefined,
    pipeline: undefined,
    drawing: undefined,
    intent: undefined,
    choices: opts.choices?.length ? opts.choices : undefined,
    proposedOps: opts.proposedOps?.length ? opts.proposedOps : undefined,
    proposalId: opts.proposalId || undefined,
    applyChoice: opts.applyChoice || undefined,
    choiceUi: opts.choiceUi,
    steps: buildChatProcessSteps(opts.t, m),
  });
}

/** True when analysis/thinking already landed in structured `steps` (not final bubble). */
export function hasStructuredProcess(steps: ChatUiMessage['steps']): boolean {
  return (steps || []).some((s) => {
    if (s.kind !== 'thought' && s.kind !== 'explored') return false;
    return Boolean((s.summary || s.body || '').trim());
  });
}

/**
 * Final assistant bubble after design `done`.
 * Progress lives in `steps` / analysis_delta / activity / phase — never guess from Chinese/English prefixes.
 * `summary` is the structured finish text from the done event; `content` is chat token stream only.
 */
export function pickDesignDoneContent(opts: {
  t: TFn;
  summary?: string;
  streamedContent: string;
  steps: ChatUiMessage['steps'];
  painted: boolean;
  designStarted: boolean;
  hasProposedOps: boolean;
}): string {
  const summary = (opts.summary || '').trim();
  const streamed = opts.streamedContent.trim();

  if (opts.hasProposedOps) return summary || streamed;

  if (opts.painted) {
    if (summary) return summary;
    return hasStructuredProcess(opts.steps)
      ? opts.t('agent.canvasReadyHint')
      : opts.t('agent.canvasUpdated');
  }

  if (opts.designStarted) return summary || opts.t('agent.designEmptyResult');

  return streamed || summary || opts.t('agent.stopped');
}

function patchDesignDoneAssistant(
  m: ChatUiMessage,
  opts: {
    t: TFn;
    finish: FinishAssistant;
    painted: boolean;
    designStarted: boolean;
    summary?: string;
    choices?: string[];
    proposedOps?: ChatUiMessage['proposedOps'];
    proposalId?: string;
    applyChoice?: string;
    choiceUi?: ChatUiMessage['choiceUi'];
  }
): ChatUiMessage {
  const result = pickDesignDoneContent({
    t: opts.t,
    summary: opts.summary,
    streamedContent: m.content || '',
    steps: m.steps,
    painted: opts.painted,
    designStarted: opts.designStarted,
    hasProposedOps: Boolean(opts.proposedOps?.length),
  });
  return opts.finish(m, {
    content: result,
    thinking: undefined,
    pipeline: undefined,
    drawing: undefined,
    intent: undefined,
    choices: opts.choices?.length ? opts.choices : undefined,
    proposedOps: opts.proposedOps?.length ? opts.proposedOps : undefined,
    proposalId: opts.proposalId || undefined,
    applyChoice: opts.applyChoice || undefined,
    choiceUi: opts.choiceUi,
    steps: (m.steps || []).map((s) => ({
      ...s,
      status: s.status === 'error' ? s.status : ('done' as const),
    })),
  });
}

/** Map structured design error `code` → i18n. Message text is ignored. */
const DESIGN_ERROR_I18N: Record<string, string> = {
  free_daily_exhausted: 'agent.freeDailyExhausted',
  insufficient_credits: 'agent.insufficientCredits',
  prompt_required: 'agent.requestFailed',
  invalid_run_mode: 'agent.requestFailed',
  invalid_canvas_size: 'agent.requestFailed',
  paint_ops_failed: 'agent.designExecFailed',
  validate_failed: 'agent.designExecFailed',
  vision_unavailable: 'agent.designExecFailed',
  blocked: 'agent.requestFailed',
  timeout: 'agent.requestFailed',
  cancelled: 'agent.stopped',
  task_not_found: 'agent.requestFailed',
  auth_forbidden: 'agent.requestFailed',
  forbidden: 'agent.requestFailed',
  resume_token_mismatch: 'agent.requestFailed',
  checkpoint_empty: 'agent.requestFailed',
  checkpoint_corrupt: 'agent.requestFailed',
  checkpoint_unavailable: 'agent.requestFailed',
  lease_held: 'agent.requestFailed',
  not_resumable: 'agent.requestFailed',
  internal_error: 'agent.designExecFailed',
  missing_tool_ops: 'agent.designOpsMissing',
  design_failed: 'agent.requestFailed',
};

/** Fixed UX tips from kernel (`token.code`) → FE i18n. */
const DESIGN_UX_TIP_I18N: Record<string, string> = {
  decide_failed: 'agent.uxTipDecideFailed',
  paint_failed: 'agent.uxTipPaintFailed',
  observe_ops_failed: 'agent.uxTipObserveOpsFailed',
  apply_confirm_failed: 'agent.uxTipApplyConfirmFailed',
  observe_scene_timeout: 'agent.uxTipObserveSceneTimeout',
  observe_critique_failed: 'agent.uxTipObserveCritiqueFailed',
  review_must_fix: 'agent.uxTipReviewMustFix',
  apply_ops_applied: 'agent.uxTipApplyOpsApplied',
  ask_dismissed: 'agent.uxTipAskDismissed',
};

export function humanizeDesignError(
  t: (key: string, opts?: Record<string, unknown>) => string,
  code?: string | null
): string {
  const codeKey = String(code || '').trim().toLowerCase();
  const i18nKey = codeKey ? DESIGN_ERROR_I18N[codeKey] : undefined;
  return t(i18nKey || 'agent.requestFailed');
}

export function humanizeDesignUxTip(
  t: (key: string, opts?: Record<string, unknown>) => string,
  code?: string | null,
  params?: Record<string, string> | null,
  fallbackText?: string | null
): string {
  const codeKey = String(code || '').trim().toLowerCase();
  const i18nKey = codeKey ? DESIGN_UX_TIP_I18N[codeKey] : undefined;
  if (i18nKey) {
    try {
      return String(t(i18nKey, { ...(params || {}) }));
    } catch {
      /* fall through */
    }
  }
  return String(fallbackText || '').trim() || t('agent.requestFailed');
}

export function assistantDurationMs(
  m: ChatUiMessage,
  patch: Partial<ChatUiMessage>
): number | undefined {
  if (typeof patch.durationMs === 'number') return patch.durationMs;
  if (m.startedAt) return Date.now() - m.startedAt;
  return m.durationMs;
}

export type { DesignSendMutable };

export function createDesignAgentEventRouter(opts: {
  t: TFn;
  assistantId: string;
  userMsg: ChatUiMessage;
  chipNorm: string;
  setMessages: (updater: (prev: ChatUiMessage[]) => ChatUiMessage[]) => void;
  setImageAspectRatio: (next: string) => void;
  setDesignScene: (scene: DesignScene) => void;
  designSceneRef: { current: DesignScene | null };
  lastAgentFrameIdRef: { current: string | null };
  lastAgentSvgByFrameRef: { current: Map<string, string> };
  checkpointsRef: { current: Map<string, any> };
  store: Store;
  finishAssistantPatch: (m: ChatUiMessage, patch?: Partial<ChatUiMessage>) => ChatUiMessage;
  mutable: DesignSendMutable;
}) {
  const handleUiChat = () => {
    opts.mutable.designStarted = false;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        return opts.finishAssistantPatch(m, {
          content: (m.content || '').trim(),
          steps: buildChatProcessSteps(opts.t, m),
          thinking: undefined,
          pipeline: undefined,
          drawing: undefined,
          intent: undefined,
        });
      })
    );
  };

  const handleUiToken = (ev: Extract<AgentStepEvent, { type: 'token' }>) => {
    opts.mutable.designStarted = false;
    const piece = humanizeDesignUxTip(
      opts.t,
      ev.code,
      ev.params,
      ev.text
    );
    if (!piece) return;
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? {
              ...m,
              // Tip codes replace; model stream tokens still append.
              content: ev.code ? piece : (m.content || '') + piece,
              intent: undefined,
              thinking: undefined,
            }
          : m
      )
    );
  };

  const handleUiThinking = (ev: Extract<AgentStepEvent, { type: 'thinking' }>) => {
    const piece = String(ev.text);
    if (!piece) return;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        return {
          ...m,
          steps: applyThinkingBodyToSteps(
            m.steps || [],
            piece,
            Boolean(ev.replace),
            opts.t
          ),
        };
      })
    );
  };

  const handleUiAnalysisDelta = (ev: Extract<AgentStepEvent, { type: 'analysis_delta' }>) => {
    const piece = String(ev.text || '');
    if (!piece.trim()) return;
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const next = applyAnalysisDeltaToSteps(m.steps || [], piece);
        return next ? { ...m, steps: next } : m;
      })
    );
  };

  const handleUiCanvas = (ev: Extract<AgentStepEvent, { type: 'canvas' }>) => {
    const next = String(ev.size).trim();
    const sendLocked = /^\d+x\d+$/.test(opts.chipNorm);
    const keepAutoChip =
      opts.chipNorm === 'auto' || /^(?:\d+xauto|autox\d+)$/.test(opts.chipNorm);
    if (!sendLocked && next && !keepAutoChip) opts.setImageAspectRatio(next);
    if (
      ev.scene === 'website' ||
      ev.scene === 'mobile' ||
      ev.scene === 'image' ||
      ev.scene === 'poster' ||
      ev.scene === 'drawing'
    ) {
      opts.setDesignScene(ev.scene);
      opts.designSceneRef.current = ev.scene;
    }
  };

  const handleUiActivity = (ev: Extract<AgentStepEvent, { type: 'activity' }>) => {
    if (ev.kind === 'tool' || ev.kind === 'added' || ev.kind === 'updated') {
      opts.mutable.designStarted = true;
    }
    if (ev.kind === 'thought') return;
    const actStatus = normalizeActivityStatus(ev.status);
    const label = formatActivityLabel(opts.t, {
      kind: ev.kind,
      status: actStatus,
      durationSec: ev.durationSec,
      count: ev.count,
      skillName: ev.skillName,
      detail: ev.detail,
      stage: ev.stage,
      code: ev.code,
    });
    if (!label) return;
    const detailText = (ev.detail || '').trim();
    const summaryText = String(ev.summary || '').trim();
    const bodyText = ev.body ? String(ev.body) : '';
    const summary = activityRowSummary({
      kind: ev.kind,
      label,
      detailText,
      summaryText,
      bodyText,
    });
    const variant = activityRowVariant(actStatus, ev.kind);
    const nestItem = activityNestItem(opts.t, ev.item);
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== opts.assistantId) return m;
        const next = applyActivityEventToSteps(m.steps || [], {
          kind: ev.kind,
          eventId: ev.id,
          status: actStatus,
          label,
          summary,
          variant,
          nestItem,
          bodyMd: bodyText,
        });
        return next ? { ...m, steps: next } : m;
      })
    );
  };

  const handleUiPhase = (ev: Extract<AgentStepEvent, { type: 'phase' }>) => {
    const labels = ev.progress.labels || [];
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? {
              ...m,
              pipeline: {
                category: ev.progress.category,
                labels,
                currentIndex: ev.progress.currentIndex,
                stepConfirm: Boolean(ev.progress.stepConfirm),
                collabMode:
                  (ev.progress.collabMode as 'collaborative' | 'milestone' | 'auto' | undefined) ||
                  'auto',
              },
            }
          : m
      )
    );
  };

  const handleUiSvgDelta = (ev: Extract<AgentStepEvent, { type: 'svg_delta' }>) => {
    opts.mutable.designStarted = true;
    if (!ev.svg) return;
    const fid =
      opts.lastAgentFrameIdRef.current ||
      (opts.store.getState() as any).editor.document?.activeFrameId ||
      null;
    if (!fid) return;
    opts.lastAgentSvgByFrameRef.current.set(String(fid), ev.svg);
    opts.lastAgentFrameIdRef.current = String(fid);
  };

  const handleUiError = (ev: Extract<AgentStepEvent, { type: 'error' }>) => {
    const friendly = humanizeDesignError(opts.t, ev.code);
    message.error(friendly);
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? opts.finishAssistantPatch(m, {
              content: m.content || friendly || opts.t('agent.requestFailed'),
              thinking: undefined,
              pipeline: undefined,
              drawing: undefined,
              canResume: false,
            })
          : m
      )
    );
  };

  const handleUiPaused = (ev: Extract<AgentStepEvent, { type: 'paused' }>) => {
    const tip = opts.t('agent.pausedHint');
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? opts.finishAssistantPatch(m, {
              content: m.content?.trim() ? m.content : tip,
              thinking: undefined,
              pipeline: undefined,
              drawing: undefined,
              designTaskId: ev.taskId || m.designTaskId,
              designResumeToken: ev.resumeToken || m.designResumeToken,
              canResume: Boolean(ev.taskId || m.designTaskId),
            })
          : m
      )
    );
  };

  const handleUiTask = (ev: Extract<AgentStepEvent, { type: 'task' }>) => {
    opts.setMessages((prev) =>
      prev.map((m) =>
        m.id === opts.assistantId
          ? { ...m, designTaskId: ev.taskId, canResume: false }
          : m
      )
    );
  };

  const handleUiDone = (ev: Extract<AgentStepEvent, { type: 'done' }>) => {
    const painted = Boolean(ev.painted);
    if (painted) {
      opts.mutable.canvasMutated = true;
      opts.mutable.nodesPainted = true;
    }
    opts.setMessages((prev) =>
      prev.map((m) => {
        if (m.id === opts.assistantId) {
          if (!opts.mutable.designStarted) {
            return {
              ...patchChatDoneAssistant(m, {
                t: opts.t,
                finish: opts.finishAssistantPatch,
                choices: ev.choices,
                proposedOps: ev.proposedOps,
                proposalId: ev.proposalId,
                applyChoice: ev.applyChoice,
                choiceUi: ev.choiceUi,
              }),
              ...(ev.taskId ? { designTaskId: ev.taskId } : {}),
              canResume: false,
              designResumeToken: undefined,
            };
          }
          return {
            ...patchDesignDoneAssistant(m, {
              t: opts.t,
              finish: opts.finishAssistantPatch,
              painted,
              designStarted: opts.mutable.designStarted,
              summary: ev.summary,
              choices: ev.choices,
              proposedOps: ev.proposedOps,
              proposalId: ev.proposalId,
              applyChoice: ev.applyChoice,
              choiceUi: ev.choiceUi,
            }),
            ...(ev.taskId ? { designTaskId: ev.taskId } : {}),
            canResume: false,
            designResumeToken: undefined,
          };
        }
        if (
          m.id === opts.userMsg.id &&
          painted &&
          opts.checkpointsRef.current.has(opts.userMsg.id)
        ) {
          return { ...m, canRestore: true };
        }
        return m;
      })
    );
  };

  return (ev: AgentStepEvent) => {
    switch (ev.type) {
      case 'permission':
        return;
      case 'chat':
        handleUiChat();
        return;
      case 'token':
        handleUiToken(ev);
        return;
      case 'thinking':
        if (ev.text) handleUiThinking(ev);
        return;
      case 'analysis_delta':
        if (ev.text) handleUiAnalysisDelta(ev);
        return;
      case 'intelligence':
        opts.setMessages((prev) =>
          prev.map((m) =>
            m.id === opts.assistantId
              ? {
                  ...m,
                  intelligence: mergeDesignIntelligence(m.intelligence, ev.patch),
                }
              : m
          )
        );
        return;
      case 'canvas':
        if (ev.size) handleUiCanvas(ev);
        return;
      case 'analysis':
        return;
      case 'drawing':
        opts.mutable.designStarted = true;
        opts.setMessages((prev) =>
          prev.map((m) =>
            m.id === opts.assistantId ? { ...m, drawing: Boolean(ev.active) } : m
          )
        );
        return;
      case 'activity':
        handleUiActivity(ev);
        return;
      case 'phase':
        handleUiPhase(ev);
        return;
      case 'svg_delta':
        handleUiSvgDelta(ev);
        return;
      case 'error':
        handleUiError(ev);
        return;
      case 'paused':
        handleUiPaused(ev);
        return;
      case 'task':
        handleUiTask(ev);
        return;
      case 'done':
        handleUiDone(ev);
        return;
      default:
        return;
    }
  };
}
