import { nanoid } from '@reduxjs/toolkit';
import { listSceneNodes, normalizeDocument } from './sceneDocument';
import type { SceneDocument, SceneNode, SceneNodeInput } from '@/components/rcb/sceneNode';

/** Logical multi-object groups via attrs.groupId. */

export function readNodeGroupId(node: SceneNodeInput): string | null {
  const id = String(node?.attrs?.groupId || '').trim();
  return id || null;
}

/** All node ids that share the same groupId. */
export function listGroupMemberIds(
  doc: SceneDocument | null | undefined,
  groupId: string
): string[] {
  if (!doc || !groupId) return [];
  return listSceneNodes(doc)
    .filter(({ node }) => readNodeGroupId(node) === groupId)
    .map(({ id }) => id);
}

/**
 * Expand a selection so that picking any member selects the whole group.
 * Used on click / marquee select (not when empty).
 */
export function expandSelectionWithGroups(
  doc: SceneDocument | null | undefined,
  nodeIds: string[]
): string[] {
  if (!doc || !nodeIds?.length) return nodeIds || [];
  const out = new Set<string>();
  for (const id of nodeIds) {
    const gid = readNodeGroupId(doc.deltaSetLike?.[id]);
    if (!gid) {
      out.add(id);
      continue;
    }
    listGroupMemberIds(doc, gid).forEach((mid) => out.add(mid));
  }
  return [...out];
}

/**
 * If every selected id shares one groupId and the selection is exactly that group,
 * return the groupId; otherwise null.
 */
export function selectionSharedGroupId(
  doc: SceneDocument | null | undefined,
  nodeIds: string[]
): string | null {
  if (!doc || !nodeIds || nodeIds.length < 2) return null;
  const first = readNodeGroupId(doc.deltaSetLike?.[nodeIds[0]]);
  if (!first) return null;
  if (!nodeIds.every((id) => readNodeGroupId(doc.deltaSetLike?.[id]) === first)) return null;
  const members = listGroupMemberIds(doc, first);
  if (members.length !== nodeIds.length) return null;
  const set = new Set(nodeIds);
  if (!members.every((id) => set.has(id))) return null;
  return first;
}

/** Assign a shared groupId to the given nodes. */
export function groupNodesInDocument(doc: SceneDocument, nodeIds: string[]) {
  const ids = [...new Set((nodeIds || []).filter(Boolean))];
  if (ids.length < 2) return doc;
  const next = normalizeDocument(doc);
  const groupId = nanoid(8);
  ids.forEach((id) => {
    const node = next.deltaSetLike?.[id];
    if (!node) return;
    node.attrs = { ...(node.attrs || {}), groupId };
  });
  return next;
}

/** Clear groupId from the given nodes (and leftover siblings in that group). */
export function ungroupNodesInDocument(doc: SceneDocument, nodeIds: string[]) {
  const ids = [...new Set((nodeIds || []).filter(Boolean))];
  if (!ids.length) return doc;
  const next = normalizeDocument(doc);
  const groupIds = new Set<string>();
  ids.forEach((id) => {
    const gid = readNodeGroupId(next.deltaSetLike?.[id]);
    if (gid) groupIds.add(gid);
  });
  if (!groupIds.size) return doc;
  listSceneNodes(next).forEach(({ id, node }) => {
    const gid = readNodeGroupId(node);
    if (!gid || !groupIds.has(gid)) return;
    const attrs = { ...(node.attrs || {}) };
    delete attrs.groupId;
    node.attrs = attrs;
    next.deltaSetLike[id] = node;
  });
  return next;
}

/** Scene nodes whose center lies inside any of the given artboards. */
