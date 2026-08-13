"""Skill pack meta normalize + extends parse (open surface)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

META_NAMES = ("_meta.json", "meta.json")
SKILL_MD_NAMES = ("SKILL.md", "skill.md")

_DISABLED = frozenset({False, "false", "0", 0, "no", "off"})


def pack_has_product_meta(pack_dir: Path) -> bool:
    return any((pack_dir / name).is_file() for name in META_NAMES)


def parse_extends(meta: dict[str, Any]) -> list[str]:
    raw = meta.get("extends") or meta.get("requires") or meta.get("depends_on") or []
    if isinstance(raw, str):
        raw = [x.strip() for x in raw.split(",") if x.strip()]
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    seen: set[str] = set()
    for item in raw:
        key = str(item or "").strip().lower()
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def normalize_pack_meta(meta: dict[str, Any], *, folder: str) -> dict[str, Any] | None:
    """Normalize extension-friendly aliases onto the product skill meta shape.

    Accepts optional plugin-style fields (``id``, ``trigger_keywords``, ``enabled``,
    ``author``, ``permissions``) without requiring a separate plugin runtime.
    Returns ``None`` when the pack is disabled.
    """
    out = dict(meta)
    if "enabled" in out and out.get("enabled") in _DISABLED:
        return None

    if not str(out.get("skill_key") or out.get("skillKey") or "").strip():
        alt = str(out.get("id") or out.get("name") or folder or "").strip()
        if alt:
            out["skill_key"] = alt

    triggers = out.get("triggers")
    keywords = out.get("trigger_keywords") or out.get("triggerKeywords")
    if (not triggers) and isinstance(keywords, list):
        words = [str(x).strip() for x in keywords if str(x).strip()]
        if words:
            out["triggers"] = [
                {
                    "intent_in": ["create", "edit"],
                    "prompt_includes_any": words,
                }
            ]

    # permissions is documentation / future ACL; preferred_tools remains the live gate.
    if out.get("allowed_resources") is None and out.get("allowedResources") is None:
        perms = out.get("permissions")
        if isinstance(perms, list) and perms:
            out["allowed_resources"] = ["tools"]

    author = str(out.get("author") or "").strip()
    if author:
        out["_author"] = author
    return out
