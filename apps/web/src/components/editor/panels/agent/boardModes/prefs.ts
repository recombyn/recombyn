/**
 * Persist Design Agent board paint mode (ops | img_layers).
 * Used by Agent settings (AgentRoutePrefsEditor account form) and runDesignAgent body.
 */

import {
  type AgentPaintMode,
  normalizeAgentPaintMode,
} from './types';

const PAINT_MODE_KEY = 'recombyn.agentPaintMode.v1';

export function loadAgentPaintMode(): AgentPaintMode {
  try {
    if (typeof localStorage === 'undefined') return 'ops';
    return normalizeAgentPaintMode(localStorage.getItem(PAINT_MODE_KEY));
  } catch {
    return 'ops';
  }
}

export function saveAgentPaintMode(mode: AgentPaintMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PAINT_MODE_KEY, normalizeAgentPaintMode(mode));
  } catch {
    /* ignore quota / private mode */
  }
}
