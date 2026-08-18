"""Skill pack meta normalize + extends parse (open surface)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

META_NAMES = ("_meta.json",)
SKILL_MD_NAMES = ("SKILL.md",)

_DISABLED = frozenset({False, "false", "0", 0, "no", "off"})


def pack_has_product_meta(pack_dir: Path) -> bool:
    return any((pack_dir / name).is_file() for name in META_NAMES)


def parse_extends(meta: dict[str, Any]) -> list[str]:
    raw = meta.get("extends") or []
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
    """Normalize pack meta onto the product skill shape.

    Returns ``None`` when the pack is disabled.
    """
    out = dict(meta)
    if "enabled" in out and out.get("enabled") in _DISABLED:
        return None

    key = str(out.get("skill_key") or folder or "").strip()
    if not key:
        return None
    out["skill_key"] = key

    author = str(out.get("author") or "").strip()
    if author:
        out["_author"] = author
    return out
