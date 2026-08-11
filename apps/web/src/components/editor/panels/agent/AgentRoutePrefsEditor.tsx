/**
 * Auto routing prefs editor — compact popover (home / dock) + account form.
 */

import { useEffect, useRef, useState, type ReactNode, memo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi2';
import {
  type ChatModelsResponse,
  type LlmModel,
} from '@/service/chat';
import {
  modelAllowsRouteSlot,
  modelIsImageGenerator,
  isImageKind,
  isVideoKind,
} from '@/components/editor/panels/agent/llmModelMeta';
import { type DesignCatalog } from '@/service/design';
import { apiQuery } from '@/service/client';
import { Dropdown, SegmentedControl, Select, Tooltip } from '@/components/base';
import { cn } from '@/utils/classnames';
import { isDesktopLocal } from '@/utils/apiBase';
import { getToken } from '@/utils/token';
import {
  customProvidersAsModels,
  hydrateCustomLlmProviders,
} from './customLlmProviders';
import ModelPickerPanel, {
  AGENT_ROUTE_POPOVER_PANEL,
  AGENT_ROUTE_SUBMENU_PANEL,
  ModelBrandIcon,
  ModelMetaBadge,
  isUserCustomModel,
  modelDescription,
} from './ModelPickerPanel';
import {
  type AgentRoutePreset,
  type AgentRoutePrefs,
  cachePresetRules,
  emptyCustomRoutePrefs,
  getCachedOpenrouterAvailability,
  getCachedPresetRules,
  loadAgentRoutePrefs,
  resolvePresetForRegion,
  saveAgentRoutePrefs,
  seedCustomLaneFromPrefs,
  warmOpenrouterAvailability,
} from './agentRoutePrefs';
import {
  loadAgentPaintMode,
  saveAgentPaintMode,
} from './boardModes/prefs';
import {
  type AgentPaintMode,
  normalizeAgentPaintMode,
} from './boardModes/types';

const selectFieldClass =
  'mt-1.5 w-full !h-10 rounded-lg border-0 bg-[var(--account-main)] px-3 pr-8 text-[14px] text-[var(--ink)] ring-1 ring-[var(--line)]';

const NARROW_MQ = '(max-width: 767px)';

function useNarrowViewport() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MQ).matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia(NARROW_MQ);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return narrow;
}

/** Nested route flyouts — same dismiss guard as AgentComposerShell model Dropdown. */
const ROUTE_SUBMENU_DISMISS_GUARD =
  '[data-agent-route-submenu], .rcb-agent-route-submenu-popup';

export function splitByokRouteModels(byok: LlmModel[]): { text: LlmModel[]; image: LlmModel[] } {
  return {
    text: byok.filter((m) => m.kind !== 'image' && m.kind !== 'video'),
    image: byok.filter((m) => m.kind === 'image' || modelIsImageGenerator(m)),
  };
}

/** Local desktop → BYOK lanes only; otherwise platform catalog. */
export function routeCatalogFromListModels(res?: {
  models?: LlmModel[] | null;
  imageModels?: LlmModel[] | null;
} | null): { text: LlmModel[]; image: LlmModel[] } {
  if (isDesktopLocal()) return splitByokRouteModels(customProvidersAsModels());
  return {
    text: res?.models || [],
    image: res?.imageModels || [],
  };
}

type RouteCatalogLoadState = 'loading' | 'ready' | 'error';

function routeCatalogLoadState(opts: {
  fromParent: boolean;
  shared: SharedRouteCatalog | null | undefined;
  query: { isLoading: boolean; isFetched: boolean; isError: boolean };
}): RouteCatalogLoadState {
  if (opts.fromParent) {
    if (opts.shared) return 'ready';
    return 'loading';
  }
  if (opts.query.isLoading || !opts.query.isFetched) return 'loading';
  if (opts.query.isError) return 'error';
  return 'ready';
}

type RouteLaneT = (key: string, opts?: Record<string, unknown>) => string;

function renderRouteLaneSelectLabel(opts: {
  model: LlmModel | null;
  label: string;
  muted: boolean;
}): ReactNode {
  const { model, label, muted } = opts;
  return (
    <span className="flex min-w-0 items-center gap-2 pr-4">
      {model ? <ModelBrandIcon model={model} size={18} className="shrink-0" /> : null}
      <span className={cn('truncate', muted ? 'text-[var(--muted)]' : '')}>{label}</span>
    </span>
  );
}

function renderRouteLaneOptionMeta(
  full: LlmModel | null,
  t: RouteLaneT
): ReactNode {
  if (!full || !isUserCustomModel(full)) return null;
  return <ModelMetaBadge label={t('agent.modelBadgeCustom')} />;
}

function renderRouteLaneSelectOption(
  opt: { value: string | number; label: ReactNode },
  catalogPool: LlmModel[],
  t: RouteLaneT
): ReactNode {
  const full = catalogPool.find((x) => x.id === opt.value) || null;
  const desc = full ? modelDescription(full, t) : undefined;
  return (
    <span className="flex w-full min-w-0 items-start gap-2.5">
      {full ? <ModelBrandIcon model={full} size={18} className="mt-0.5 shrink-0" /> : null}
      <span className="min-w-0 flex-1 overflow-hidden">
        <span className="flex min-w-0 items-start justify-between gap-2">
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium leading-5 text-[var(--ink)]">
            {opt.label}
          </span>
          {renderRouteLaneOptionMeta(full, t)}
        </span>
        {desc ? (
          <span className="mt-0.5 block min-w-0 max-w-full truncate text-[11px] leading-[1.35] text-[var(--muted)]">
            {desc}
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Select `value` — only named presets; everything else maps to platform. */
function selectValueForRoutePreset(preset: AgentRoutePreset): AgentRoutePreset {
  if (preset === 'balanced' || preset === 'quality' || preset === 'custom') return preset;
  return 'platform';
}

function routePresetNoteText(preset: AgentRoutePreset, t: RouteLaneT): string {
  switch (preset) {
    case 'balanced':
      return t('account.agentRouteBalancedNote');
    case 'quality':
      return t('account.agentRouteQualityNote');
    case 'custom':
      return t('account.agentRouteCard.custom.desc');
    default:
      return t('account.agentRoutePlatformNote');
  }
}

function modelOptions(
  models: LlmModel[],
  slot: 'fast' | 'standard' | 'reasoning' | 'vision' | 'image'
): { id: string; label: string }[] {
  const seen = new Set<string>();
  const out: { id: string; label: string }[] = [];
  for (const m of models) {
    if (!m.id || m.id === 'auto') continue;
    if (!modelAllowsRouteSlot(m, slot)) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    out.push({ id: m.id, label: m.label || m.id });
  }
  return out;
}

function mergeModelCatalogPool(textModels: LlmModel[], imageModels: LlmModel[]): LlmModel[] {
  const byId = new Map<string, LlmModel>();
  for (const m of textModels) {
    if (m?.id) byId.set(m.id, m);
  }
  for (const m of imageModels) {
    if (!m?.id) continue;
    byId.set(m.id, { ...byId.get(m.id), ...m, kind: 'image' });
  }
  return [...byId.values()];
}

function routePresetShortLabel(
  preset: string | undefined,
  t: (key: string) => string
): string {
  switch (preset) {
    case 'balanced':
      return t('account.agentRouteCard.balanced.title');
    case 'quality':
      return t('account.agentRouteCard.quality.title');
    case 'custom':
      return t('account.agentRouteCard.custom.title');
    default:
      return t('account.agentRouteCard.platform.title');
  }
}

function headerStatusLabelOf(opts: {
  activeRouteTab: 'auto' | 'custom' | 'single';
  selectedSingleId: string;
  singleModelRows: Array<{ id: string; label?: string }>;
  presetShortLabel: string;
}): string {
  if (opts.activeRouteTab !== 'single' || opts.selectedSingleId === 'auto') {
    return opts.presetShortLabel;
  }
  const hit = opts.singleModelRows.find((m) => m.id === opts.selectedSingleId);
  return hit?.label || opts.selectedSingleId;
}

/** Keep current / remembered single id when still in catalog; else first row. */
function resolveSingleModelPickId(
  selectedId: string,
  rows: Array<{ id: string }>,
  rememberedId?: string
): string {
  if (selectedId !== 'auto' && rows.some((m) => m.id === selectedId)) {
    return selectedId;
  }
  const remembered = String(rememberedId || '').trim();
  if (remembered && remembered !== 'auto' && rows.some((m) => m.id === remembered)) {
    return remembered;
  }
  return rows[0]?.id || '';
}

type CompactSubmenu =
  | { kind: 'preset' }
  | { kind: 'field'; key: 'fast' | 'standard' | 'reasoning' | 'vision' | 'image' }
  | null;

function submenuSelectedIdOf(
  submenu: CompactSubmenu,
  routePrefs: AgentRoutePrefs
): string {
  if (submenu?.kind === 'field') return String(routePrefs[submenu.key] || '');
  if (submenu?.kind !== 'preset') return '';
  if (routePrefs.preset === 'economy') return 'platform';
  if (routePrefs.preset === 'custom') return '';
  return routePrefs.preset;
}

export type SharedRouteCatalog = {
  text: LlmModel[];
  image: LlmModel[];
  openrouterAvailable: boolean | null;
};

type AgentRoutePrefsEditorProps = {
  /** Popover in agent dock / home — Lovart-style card (not account form). */
  compact?: boolean;
  /** Shown on the compact header left (Agent / Ask). */
  modeLabel?: string;
  className?: string;
  /** Fired after prefs are written to localStorage. */
  onChanged?: (prefs: AgentRoutePrefs) => void;
  /**
   * When set (Account Agent tab), parent owns GET /chat/models + BYOK hydrate —
   * do not fetch again. `null` = still loading; object = ready.
   */
  sharedCatalog?: SharedRouteCatalog | null;
  /**
   * Compact popover: selected chat model (`auto` = multi-lane;
   * concrete id = single-model lock).
   */
  selectedModelId?: string;
  /** Compact「单模型」tab: pick a concrete catalog model. */
  onPickModel?: (modelId: string) => void;
  /** When true, only Auto routing is free (member plan). */
  autoOnly?: boolean;
};

/**
 * Auto routing prefs editor — shared by Account settings and Agent/Ask model popover.
 * Same storage + presets as account.agentRoute* (platform / economy / balanced / quality / custom).
 */
function AgentRoutePrefsEditorImpl({
  compact = false,
  modeLabel,
  className,
  onChanged,
  sharedCatalog,
  selectedModelId,
  onPickModel,
  autoOnly = false,
}: AgentRoutePrefsEditorProps): ReactNode {
  const { t } = useTranslation();
  const desktopLocal = isDesktopLocal();
  const catalogFromParent = sharedCatalog !== undefined;
  const [routePrefs, setRoutePrefs] = useState<AgentRoutePrefs>(() =>
    desktopLocal ? emptyCustomRoutePrefs() : { preset: 'platform' }
  );
  const [paintMode, setPaintMode] = useState<AgentPaintMode>(() => loadAgentPaintMode());
  const [routeSaved, setRouteSaved] = useState(false);
  const [textModels, setTextModels] = useState<LlmModel[]>([]);
  const [imageModels, setImageModels] = useState<LlmModel[]>([]);
  const [submenu, setSubmenu] = useState<CompactSubmenu>(null);
  /** Compact popover body: Auto | Multi-route | Single — UI only, not persisted. */
  const [routePanelTab, setRoutePanelTab] = useState<'auto' | 'custom' | 'single' | null>(
    null
  );
  /** Remember last concrete single-model pick across Auto / Multi-route tab switches. */
  const lastSingleModelIdRef = useRef('');
  const [openrouterAvailable, setOpenrouterAvailable] = useState<boolean | null>(() => getCachedOpenrouterAvailability());
  const narrow = useNarrowViewport();

  useEffect(() => {
    setRoutePrefs(loadAgentRoutePrefs());
    setPaintMode(loadAgentPaintMode());
  }, []);

  // Account Agent tab loads catalog once on the parent — skip duplicate design fetch there.
  const designCatalogQuery = useQuery({
    ...apiQuery.designDesignCatalog.queryOptions(),
    staleTime: 60_000,
    enabled: !catalogFromParent,
  });

  const modelsQuery = useQuery({
    ...apiQuery.chatGetModels.queryOptions(),
    staleTime: 60_000,
    enabled: !catalogFromParent,
  });

  const byokListQuery = useQuery({
    ...apiQuery.meMeByokList.queryOptions(),
    staleTime: 30_000,
    enabled: !catalogFromParent && desktopLocal && Boolean(getToken()),
  });

  useEffect(() => {
    if (catalogFromParent) return;
    const cat = designCatalogQuery.data as DesignCatalog | undefined;
    if (!cat) return;
    const rules = cat.global_rules || {};
    cachePresetRules(rules);
    setRoutePrefs(loadAgentRoutePrefs(rules));
  }, [catalogFromParent, designCatalogQuery.data]);

  useEffect(() => {
    if (catalogFromParent) {
      if (!sharedCatalog) return;
      setTextModels(sharedCatalog.text);
      setImageModels(sharedCatalog.image);
      setOpenrouterAvailable(sharedCatalog.openrouterAvailable);
      if (sharedCatalog.openrouterAvailable != null) {
        warmOpenrouterAvailability(sharedCatalog.openrouterAvailable);
      }
      setRoutePrefs(loadAgentRoutePrefs(getCachedPresetRules()));
      return;
    }
    if (!modelsQuery.isFetched) return;
    const res = modelsQuery.data as ChatModelsResponse | undefined;
    if (res) {
      const orOk = res.openrouterAvailable !== false;
      warmOpenrouterAvailability(orOk);
      setOpenrouterAvailable(orOk);
      const { text, image } = routeCatalogFromListModels(res);
      setTextModels(text);
      setImageModels(image);
      setRoutePrefs(loadAgentRoutePrefs(getCachedPresetRules()));
    }
  }, [catalogFromParent, sharedCatalog, modelsQuery.data, modelsQuery.isFetched]);

  // Standalone popover on local desktop: refresh BYOK lanes (Account tab parent hydrates).
  useEffect(() => {
    if (!desktopLocal || catalogFromParent) return;
    if (getToken() && !byokListQuery.isFetched) return;
    let cancelled = false;
    async function refreshByokRouteModels() {
      await hydrateCustomLlmProviders();
      if (cancelled) return;
      const { text, image } = splitByokRouteModels(customProvidersAsModels());
      setTextModels(text);
      setImageModels(image);
    }
    refreshByokRouteModels();
    return () => {
      cancelled = true;
    };
  }, [desktopLocal, catalogFromParent, byokListQuery.isFetched, byokListQuery.dataUpdatedAt]);

  const commit = (next: AgentRoutePrefs) => {
    setRoutePrefs(next);
    if (desktopLocal || next.preset === 'custom') {
      saveAgentRoutePrefs({
        preset: 'custom',
        fast: next.fast,
        standard: next.standard,
        reasoning: next.reasoning,
        vision: next.vision,
        image: next.image,
      });
    } else if (next.preset === 'balanced' || next.preset === 'quality') {
      saveAgentRoutePrefs({ preset: next.preset });
    } else {
      saveAgentRoutePrefs({ preset: 'platform' });
    }
    setRouteSaved(true);
    onChanged?.(next);
  };

  const applyPreset = (preset: AgentRoutePreset) => {
    if (desktopLocal) {
      commit({ ...routePrefs, preset: 'custom' });
      return;
    }
    if (preset === 'custom') {
      const seed = seedCustomLaneFromPrefs(routePrefs);
      commit({
        preset: 'custom',
        fast: routePrefs.fast || seed.fast,
        standard: routePrefs.standard || seed.standard,
        reasoning: routePrefs.reasoning || seed.reasoning,
        vision: routePrefs.vision || seed.vision,
        image: routePrefs.image || seed.image,
      });
      return;
    }
    if (preset === 'platform' || preset === 'economy') {
      commit({ preset: 'platform' });
      return;
    }
    if (preset === 'balanced' || preset === 'quality') {
      commit(resolvePresetForRegion(preset));
      return;
    }
    commit({ preset: 'platform' });
  };

  const patchRouteField = (key: keyof AgentRoutePrefs, value: string) => {
    setRoutePrefs((prev) => {
      const next: AgentRoutePrefs = { ...prev, preset: 'custom', [key]: value };
      saveAgentRoutePrefs(next);
      setRouteSaved(true);
      onChanged?.(next);
      return next;
    });
  };

  const saveRoutePrefs = () => {
    saveAgentRoutePrefs(routePrefs);
    setRouteSaved(true);
    onChanged?.(routePrefs);
  };

  const catalogPool = mergeModelCatalogPool(textModels, imageModels);
  const fastOpts = modelOptions(catalogPool, 'fast');
  const standardOpts = modelOptions(catalogPool, 'standard');
  const reasoningOpts = modelOptions(catalogPool, 'reasoning');
  const visionOpts = modelOptions(catalogPool, 'vision');
  const imageOpts = modelOptions(catalogPool, 'image');
  const presetOptions = desktopLocal
    ? [{ value: 'custom', label: t('account.agentRoutePresetCustom') }]
    : [
        { value: 'platform', label: t('account.agentRoutePresetPlatform') },
        { value: 'balanced', label: t('account.agentRoutePresetBalanced') },
        { value: 'quality', label: t('account.agentRoutePresetQuality') },
        { value: 'custom', label: t('account.agentRoutePresetCustom') },
      ];

  const presetShortLabel = routePresetShortLabel(routePrefs.preset, t);

  const fieldRows = [
    { key: 'fast' as const, label: t('account.agentRouteFast'), opts: fastOpts },
    { key: 'standard' as const, label: t('account.agentRouteStandard'), opts: standardOpts },
    { key: 'reasoning' as const, label: t('account.agentRouteReasoning'), opts: reasoningOpts },
    { key: 'vision' as const, label: t('account.agentRouteVision'), opts: visionOpts },
    { key: 'image' as const, label: t('account.agentRouteImage'), opts: imageOpts },
  ];

  const singleModelRows = catalogPool.filter(
    (m) => m.id !== 'auto' && !isImageKind(m) && !isVideoKind(m)
  );
  const selectedSingleId = String(selectedModelId || 'auto').trim() || 'auto';
  if (selectedSingleId !== 'auto') {
    lastSingleModelIdRef.current = selectedSingleId;
  }
  const catalogLoad = routeCatalogLoadState({
    fromParent: catalogFromParent,
    shared: sharedCatalog,
    query: modelsQuery,
  });
  const singleModelsLoading = catalogLoad === 'loading';

  const laneEmptyLabel = t('account.agentRouteLaneEmpty');

  const modelLabelOf = (id: string | undefined, opts: { id: string; label: string }[]) => {
    const v = String(id || '').trim();
    if (!v) return opts[0]?.label || laneEmptyLabel;
    return opts.find((o) => o.id === v)?.label || v;
  };

  /** Only return a catalog hit — never invent a stub (stub still draws a brand icon). */
  const modelRefOf = (id: string | undefined, opts: { id: string; label: string }[]) => {
    const v = String(id || '').trim() || opts[0]?.id || '';
    if (!v) return null;
    return catalogPool.find((m) => m.id === v) || null;
  };

  const headerTitle = modeLabel || t('agent.interactionAgent');
  /** Named presets → Auto; only `custom` → Multi-route lanes. */
  const multimodalAuto = routePrefs.preset !== 'custom';

  let activeRouteTab: 'auto' | 'custom' | 'single' = 'auto';
  if (routePanelTab) activeRouteTab = routePanelTab;
  else if (selectedSingleId !== 'auto') activeRouteTab = 'single';
  else if (!multimodalAuto) activeRouteTab = 'custom';

  const applyRoutePanelTab = (tab: string) => {
    if (tab !== 'auto' && tab !== 'custom' && tab !== 'single') return;
    setRoutePanelTab(tab);
    setSubmenu(null);
    if (tab === 'auto') {
      if (routePrefs.preset === 'custom') applyPreset('platform');
      if (onPickModel && selectedSingleId !== 'auto') onPickModel('auto');
      return;
    }
    if (tab === 'custom') {
      if (routePrefs.preset !== 'custom') applyPreset('custom');
      if (onPickModel && selectedSingleId !== 'auto') onPickModel('auto');
      return;
    }
    // Single: restore last pick when returning from Auto / Multi-route.
    if (tab === 'single' && onPickModel && !autoOnly) {
      if (selectedSingleId !== 'auto') return;
      const fallback = resolveSingleModelPickId(
        selectedSingleId,
        singleModelRows,
        lastSingleModelIdRef.current
      );
      if (fallback) onPickModel(fallback);
    }
  };

  const routeTabOptions: Array<{ value: 'auto' | 'custom' | 'single'; label: string }> = [
    { value: 'auto', label: t('agent.routeMultimodalAuto') },
  ];
  if (onPickModel) {
    routeTabOptions.push({
      value: 'single',
      label: t('agent.routeMultimodalSingle'),
    });
  }
  routeTabOptions.push({
    value: 'custom',
    label: t('agent.routeMultimodalCustom'),
  });

  const restoreSingleModelId = resolveSingleModelPickId(
    selectedSingleId,
    singleModelRows,
    lastSingleModelIdRef.current
  );
  // Catalog may load after user taps Single — only fill when still `auto`.
  // `onPickModel` via ref: parent inline handlers must not re-fire this effect.
  const onPickModelRef = useRef(onPickModel);
  onPickModelRef.current = onPickModel;
  useEffect(() => {
    if (!compact || !onPickModelRef.current || autoOnly) return;
    if (activeRouteTab !== 'single') return;
    if (selectedSingleId !== 'auto') return;
    if (!restoreSingleModelId) return;
    onPickModelRef.current(restoreSingleModelId);
  }, [
    compact,
    autoOnly,
    activeRouteTab,
    selectedSingleId,
    restoreSingleModelId,
  ]);

  if (compact) {
    const presetOrder = (
      desktopLocal ? (['custom'] as const) : (['platform', 'balanced', 'quality'] as const)
    );

    let submenuTitle = '';
    let submenuOptions: Array<{ id: string; label: string; desc?: string; model?: LlmModel | null }> =
      [];
    if (submenu?.kind === 'preset') {
      submenuTitle = t('account.agentRoutePreset');
      submenuOptions = presetOrder.map((id) => ({
        id,
        label: t(`account.agentRouteCard.${id}.title`),
        model: null,
      }));
    } else if (submenu?.kind === 'field') {
      const row = fieldRows.find((r) => r.key === submenu.key);
      if (row) {
        submenuTitle = row.label;
        submenuOptions = row.opts.map((m) => {
          const full = catalogPool.find((x) => x.id === m.id) || null;
          return {
            id: m.id,
            label: m.label,
            desc: full ? modelDescription(full, t) : undefined,
            model: full,
          };
        });
      }
    }

    const submenuSelectedId = submenuSelectedIdOf(submenu, routePrefs);
    const submenuTab =
      submenu?.kind === 'field' && submenu.key === 'image' ? 'image' : 'design';
    const submenuModels = submenuOptions.map(
      (o) =>
        o.model ||
        ({ id: o.id, label: o.label, provider: '' } satisfies LlmModel)
    );

    const renderSubmenuPanel = (opts?: { embedded?: boolean }) => {
      const embedded = Boolean(opts?.embedded);
      if (submenu?.kind === 'preset') {
        return (
          <div
            data-agent-route-submenu=""
            className={cn(
              embedded ? 'w-full' : AGENT_ROUTE_SUBMENU_PANEL,
              !embedded && 'rcb-agent-route-submenu-popup'
            )}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {embedded ? (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setSubmenu(null)}
                className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <HiChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                {t('agent.routeBack')}
              </button>
            ) : (
              <div className="px-3 pt-2.5 pb-1">
                <p className="truncate text-[12px] font-medium text-[var(--muted)]">
                  {t('account.agentRoutePreset')}
                </p>
              </div>
            )}
            <div className={cn('flex flex-col gap-1.5', embedded ? 'pt-0.5' : 'p-2 pt-1')}>
              {presetOrder.map((id) => {
                const active = routePrefs.preset === id;
                const title = t(`account.agentRouteCard.${id}.title`);
                const mult = t(`account.agentRouteCard.${id}.mult`);
                const badge = t(`account.agentRouteCard.${id}.badge`);
                const desc =
                  openrouterAvailable === false && (id === 'balanced' || id === 'quality')
                    ? t('account.agentRouteOpenrouterBlocked')
                    : t(`account.agentRouteCard.${id}.desc`);
                return (
                  <button
                    key={id}
                    type="button"
                    onPointerDown={(e) => e.preventDefault()}
                    onClick={() => {
                      applyPreset(id);
                      setSubmenu(null);
                    }}
                    className={cn(
                      'w-full min-w-0 rounded-xl px-3 py-2.5 text-left transition-colors',
                      active
                        ? 'bg-[var(--accent-soft)] text-[var(--ink)]'
                        : 'text-[var(--ink)] hover:bg-[var(--accent-soft)]'
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                        <span className="truncate text-[13px] font-bold leading-none">{title}</span>
                        <span
                          className={cn(
                            'inline-flex shrink-0 items-center rounded-md px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                            active
                              ? 'bg-[var(--surface)] text-[var(--muted)]'
                              : 'bg-[var(--line)]/55 text-[var(--muted)]'
                          )}
                        >
                          {mult}
                        </span>
                      </div>
                      <span className="min-w-0 shrink truncate text-[11px] leading-none text-[var(--muted)]">
                        {badge}
                      </span>
                    </div>
                    <p className="mt-1.5 line-clamp-2 text-[12px] leading-snug text-[var(--ink)]/75">
                      {desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }

      return (
        <div
          data-agent-route-submenu=""
          className={cn(embedded ? 'w-full' : 'rcb-agent-route-submenu-popup')}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {embedded ? (
            <div className="w-full">
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => setSubmenu(null)}
                className="mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-[var(--muted)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--ink)]"
              >
                <HiChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
                {t('agent.routeBack')}
              </button>
              <ModelPickerPanel
                chrome="plain"
                hideAuto
                useModelsAsIs
                showPrice={false}
                tab={submenuTab}
                models={submenuModels}
                selectedId={submenuSelectedId}
                onPick={(id) => {
                  if (submenu?.kind === 'field') patchRouteField(submenu.key, id);
                  setSubmenu(null);
                }}
                onRowPointerDown={(e) => e.preventDefault()}
              />
            </div>
          ) : (
            <ModelPickerPanel
              chrome="submenu"
              hideAuto
              useModelsAsIs
              showPrice={false}
              title={submenuTitle}
              tab={submenuTab}
              models={submenuModels}
              selectedId={submenuSelectedId}
              onPick={(id) => {
                if (submenu?.kind === 'field') patchRouteField(submenu.key, id);
                setSubmenu(null);
              }}
              onRowPointerDown={(e) => e.preventDefault()}
            />
          )}
        </div>
      );
    };

    /** Keep focus inside the parent floating menu — remounting rows would blur to body and flicker-close. */
    const keepParentMenuFocus = (e: { preventDefault: () => void }) => {
      e.preventDefault();
    };

    if (narrow && submenu) {
      return (
        <div className={cn(AGENT_ROUTE_POPOVER_PANEL, className)}>
          <div className="px-3 pb-3 pt-4">{renderSubmenuPanel({ embedded: true })}</div>
        </div>
      );
    }

    /**
     * Side flyout via Dropdown (flip/shift), not absolute RouteSideFlyout.
     * `items[].children` is hover 二级 for flat menus; here the body is custom
     * ModelPickerPanel / preset cards → popupRender.
     */
    const routeSideDropdown = (opts: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      trigger: ReactNode;
    }) => (
      <Dropdown
        trigger="click"
        placement="right-start"
        strategy="fixed"
        offset={20}
        items={[]}
        open={opts.open}
        onOpenChange={opts.onOpenChange}
        nestedDismissGuard={ROUTE_SUBMENU_DISMISS_GUARD}
        floatingClassName="z-[80]"
        referenceClassName="block w-full"
        popupRender={() => (
          <div className="max-w-full" onPointerDown={(e) => e.stopPropagation()}>
            {renderSubmenuPanel()}
          </div>
        )}
      >
        {opts.trigger}
      </Dropdown>
    );

    const showRouteBody = activeRouteTab === 'custom' || activeRouteTab === 'single';
    const headerStatusLabel = headerStatusLabelOf({
      activeRouteTab,
      selectedSingleId,
      singleModelRows,
      presetShortLabel,
    });
    const headerPresetClickable = activeRouteTab === 'auto';

    const headerBar = (
      <div
        className={cn(
          'mb-2.5 flex w-full min-w-0 items-center justify-between gap-2 rounded-xl bg-[var(--canvas)] px-3 py-2.5 text-left',
          headerPresetClickable &&
            'transition-colors hover:bg-[var(--canvas)]/80',
          headerPresetClickable &&
            submenu?.kind === 'preset' &&
            'ring-1 ring-[var(--line)]'
        )}
      >
        <span className="shrink-0 text-[13px] font-semibold text-[var(--ink)]">
          {headerTitle}
        </span>
        <span className="inline-flex min-w-0 max-w-[58%] items-center gap-0.5 text-[12px] text-[var(--muted)]">
          <span className="truncate">{headerStatusLabel}</span>
          {headerPresetClickable ? (
            <HiChevronRight className="h-3.5 w-3.5 shrink-0" />
          ) : null}
        </span>
      </div>
    );

    return (
      <div
        data-agent-route-prefs=""
        className={cn(
          AGENT_ROUTE_POPOVER_PANEL,
          'flex flex-col overflow-hidden',
          className
        )}
      >
        <div className="shrink-0 px-3 pb-2 pt-4">
          {headerPresetClickable ? (
            routeSideDropdown({
              open: !narrow && submenu?.kind === 'preset',
              onOpenChange: (open) => {
                if (open) setSubmenu({ kind: 'preset' });
                else setSubmenu((v) => (v?.kind === 'preset' ? null : v));
              },
              trigger: (
                <button
                  type="button"
                  className="block w-full"
                  onPointerDown={keepParentMenuFocus}
                >
                  {headerBar}
                </button>
              ),
            })
          ) : (
            headerBar
          )}

          <div className="mx-1 border-t border-[var(--line)]" />

          <div className="mt-2.5 flex items-center justify-between gap-2 px-1">
            <Tooltip tip={t('agent.routeMultimodalTip')} placement="top">
              <span className="shrink-0 cursor-default whitespace-nowrap text-[13px] font-medium text-[var(--ink)]">
                {t('agent.routeMultimodal')}
              </span>
            </Tooltip>
            <SegmentedControl
              size="xs"
              radius="full"
              aria-label={t('agent.routeMultimodal')}
              value={activeRouteTab}
              onChange={applyRoutePanelTab}
              options={routeTabOptions}
            />
          </div>
        </div>

        {showRouteBody ? (
          <div className="min-h-0 max-h-[min(280px,calc(100vh-220px))] flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3 pt-1">
            {activeRouteTab === 'custom' ? (
              <div className="px-0.5">
                {fieldRows.map((row) => {
                  const active = submenu?.kind === 'field' && submenu.key === row.key;
                  const laneModel = modelRefOf(routePrefs[row.key], row.opts);
                  return (
                    <div key={row.key}>
                      {routeSideDropdown({
                        open: !narrow && active,
                        onOpenChange: (open) => {
                          if (open) setSubmenu({ kind: 'field', key: row.key });
                          else
                            setSubmenu((v) =>
                              v?.kind === 'field' && v.key === row.key ? null : v
                            );
                        },
                        trigger: (
                          <button
                            type="button"
                            className={cn(
                              'grid w-full grid-cols-[minmax(0,1fr)_8.25rem] items-center gap-2 rounded-lg px-1 py-2 text-left transition-colors',
                              active
                                ? 'bg-[var(--accent-soft)]'
                                : 'hover:bg-[var(--accent-soft)]'
                            )}
                            onPointerDown={keepParentMenuFocus}
                          >
                            <span className="min-w-0 truncate text-[13px] text-[var(--ink)]">
                              {row.label}
                            </span>
                            <span className="grid w-[8.25rem] grid-cols-[0.875rem_minmax(0,1fr)_0.875rem] items-center gap-1 text-[12px] text-[var(--muted)]">
                              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                                {laneModel ? (
                                  <ModelBrandIcon model={laneModel} size={14} />
                                ) : null}
                              </span>
                              <span className="min-w-0 truncate">
                                {modelLabelOf(routePrefs[row.key], row.opts)}
                              </span>
                              <HiChevronRight className="h-3.5 w-3.5" />
                            </span>
                          </button>
                        ),
                      })}
                    </div>
                  );
                })}
              </div>
            ) : null}
            {activeRouteTab === 'single' && onPickModel ? (
              <div className="px-0.5">
                {singleModelsLoading ? (
                  <p className="px-1 py-2 text-[12px] text-[var(--muted)]">
                    {t('home.composerModelsLoading')}
                  </p>
                ) : null}
                {!singleModelsLoading && singleModelRows.length === 0 ? (
                  <p className="px-1 py-2 text-[12px] text-[var(--muted)]">
                    {t('agent.emptyModels')}
                  </p>
                ) : null}
                {singleModelRows.map((m) => {
                  const selected = m.id === selectedSingleId;
                  const locked = autoOnly;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={locked}
                      title={locked ? t('agent.freeModelLocked') : undefined}
                      className={cn(
                        'flex w-full items-center justify-between gap-2 rounded-lg px-1 py-2 text-left transition-colors',
                        selected && !locked
                          ? 'bg-[var(--accent-soft)]'
                          : 'hover:bg-[var(--accent-soft)]',
                        locked && 'cursor-not-allowed opacity-45 hover:bg-transparent'
                      )}
                      onPointerDown={keepParentMenuFocus}
                      onClick={() => {
                        if (locked) return;
                        onPickModel(m.id);
                      }}
                    >
                      <span className="inline-flex min-w-0 flex-1 items-center gap-2">
                        <ModelBrandIcon model={m} size={14} className="shrink-0" />
                        <span className="min-w-0 truncate text-[13px] text-[var(--ink)]">
                          {m.label || m.id}
                        </span>
                      </span>
                      {isUserCustomModel(m) ? (
                        <ModelMetaBadge label={t('agent.modelBadgeCustom')} />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="pb-3" />
        )}
      </div>
    );
  }

  const selectCls = selectFieldClass;
  const labelCls = 'text-[13px] font-medium text-[var(--ink)]';

  return (
    <div className={cn('space-y-4', className)}>
      <div>
        <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
          {t('agent.paintMode')}
        </h2>
        <p className="mb-3 text-[13px] leading-relaxed text-[var(--muted)]">
          {t('agent.paintModeTip')}
        </p>
        <SegmentedControl
          size="sm"
          radius="full"
          aria-label={t('agent.paintMode')}
          value={paintMode}
          onChange={(v) => {
            const next = normalizeAgentPaintMode(v);
            setPaintMode(next);
            saveAgentPaintMode(next);
          }}
          options={[
            { value: 'ops', label: t('agent.paintModeOps') },
            { value: 'img_layers', label: t('agent.paintModeImgLayers') },
          ]}
        />
      </div>

      <h2 className="mb-1 text-[15px] font-semibold text-[var(--ink)]">
        {t('account.agentRouteSection')}
      </h2>
      <p className="mb-1 text-[13px] leading-relaxed text-[var(--muted)]">
        {t('account.agentRouteHint')}
      </p>

      <div>
        <span className={labelCls}>{t('account.agentRoutePreset')}</span>
        <Select
          size="large"
          className={selectCls}
          value={selectValueForRoutePreset(routePrefs.preset)}
          options={presetOptions}
          onChange={(v) => applyPreset(String(v) as AgentRoutePreset)}
        />
      </div>

      {openrouterAvailable === false ? (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          {t('account.agentRouteOpenrouterBlocked')}
        </p>
      ) : (
        <p className="text-[12px] leading-relaxed text-[var(--muted)]">
          {routePresetNoteText(routePrefs.preset, t)}
        </p>
      )}

      {routePrefs.preset === 'custom' ? (
        <div className="space-y-3 rounded-lg bg-[var(--account-main)] p-3 ring-1 ring-[var(--line)]">
          {fieldRows.map((row) => {
            const currentId =
              String(routePrefs[row.key] || '').trim() || row.opts[0]?.id || '';
            const currentModel = modelRefOf(routePrefs[row.key], row.opts);
            const emptyLane = !currentId;
            return (
              <label key={row.key} className="block">
                <span className={labelCls}>{row.label}</span>
                <Select
                  size="large"
                  className={selectCls}
                  value={currentId || undefined}
                  placeholder={laneEmptyLabel}
                  options={row.opts.map((m) => ({ value: m.id, label: m.label }))}
                  onChange={(v) => patchRouteField(row.key, String(v))}
                  labelRender={() =>
                    renderRouteLaneSelectLabel({
                      model: currentModel,
                      label: modelLabelOf(routePrefs[row.key], row.opts),
                      muted: emptyLane || !currentModel,
                    })
                  }
                  optionRender={(opt) => renderRouteLaneSelectOption(opt, catalogPool, t)}
                />
              </label>
            );
          })}
          <p className="text-[12px] leading-relaxed text-[var(--muted)]">
            {t('account.agentRouteCostNote')}
          </p>
        </div>
      ) : null}
    </div>
  );
}

const MemoizedAgentRoutePrefsEditor = memo(AgentRoutePrefsEditorImpl);
export { MemoizedAgentRoutePrefsEditor as AgentRoutePrefsEditor };
