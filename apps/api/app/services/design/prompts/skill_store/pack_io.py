"""Seed / file pack loading for skill_store."""
from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any

from .constants import (
    NS_CORE,
    NS_EXT,
    SOURCE_FILE,
    _META_NAMES,
    _SKILL_MD_NAMES,
)
from .keys import (
    _slug_local_key,
    qualify_skill_key,
    split_namespace_key,
)

logger = logging.getLogger(__name__)


def _skill_md_path(pack_dir: Path) -> Path | None:
    for name in _SKILL_MD_NAMES:
        p = pack_dir / name
        if p.is_file():
            return p
    return None

def _unquote_yaml_scalar(raw: str) -> str:
    s = str(raw or "").strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in ("'", '"'):
        return s[1:-1].strip()
    return s

def _split_skill_md_frontmatter(text: str) -> tuple[dict[str, Any], str]:
    """Parse ``SKILL.md`` YAML frontmatter (flat keys only).

    Returns ``(meta, body)``. No frontmatter → ``({}, original_text)``.
    """
    raw = str(text or "").lstrip("\ufeff")
    if not raw.startswith("---"):
        return {}, raw.strip()
    lines = raw.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, raw.strip()
    end = -1
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end < 1:
        return {}, raw.strip()

    meta: dict[str, Any] = {}
    key: str | None = None
    buf: list[str] = []
    fold = False

    def flush() -> None:
        nonlocal key, buf, fold
        if not key:
            buf = []
            fold = False
            return
        if fold:
            meta[key] = " ".join(x.strip() for x in buf if x.strip()).strip()
        elif buf:
            meta[key] = _unquote_yaml_scalar("\n".join(buf).strip())
        else:
            meta[key] = ""
        key = None
        buf = []
        fold = False

    for line in lines[1:end]:
        if key and (line.startswith("  ") or line.startswith("\t")):
            buf.append(line.strip())
            continue
        m = re.match(r"^([A-Za-z0-9_-]+)\s*:\s*(.*)$", line)
        if not m:
            if key:
                buf.append(line.strip())
            continue
        flush()
        key = m.group(1).strip()
        rest = m.group(2).rstrip()
        if rest in (">", "|", ">-", "|-"):
            fold = True
            buf = []
        elif rest == "":
            fold = True
            buf = []
        else:
            fold = False
            buf = [rest]
    flush()

    body = "\n".join(lines[end + 1 :]).strip()
    return meta, body

def _meta_from_agent_skill_frontmatter(
    fm: dict[str, Any], *, folder: str
) -> dict[str, Any] | None:
    """Build a minimal pack meta from ``SKILL.md`` YAML frontmatter."""
    if not isinstance(fm, dict) or not fm:
        return None
    name = str(fm.get("name") or folder or "").strip()
    description = str(fm.get("description") or "").strip()
    if not name and not description:
        return None
    key = _slug_local_key(name or folder) or folder
    when = str(fm.get("when_to_use") or fm.get("whenToUse") or description).strip()
    display = str(
        fm.get("displayName") or fm.get("display_name") or fm.get("title") or name or key
    ).strip() or key
    return {
        "skill_key": str(fm.get("skill_key") or fm.get("skillKey") or key).strip() or key,
        "name": key,
        "displayName": display,
        "description": description or when,
        "when_to_use": when,
        "category": str(fm.get("category") or "agent").strip() or "agent",
        "version": fm.get("version") or "1.0.0",
        "scenes": "all",
        "preferred_tools": [],
        "triggers": [],
        "locales": {
            "en": {"displayName": display, "description": description or when},
        },
    }

def _repo_root() -> Path:
    """``apps/api`` → repository root."""
    from app.core.config import _API_ROOT

    return _API_ROOT.parent.parent

def _agents_skills_dir() -> Path:
    """Cursor/IDE skills tree — not scanned by the Design Agent."""
    return _repo_root() / ".agents" / "skills"


def _default_plugin_skills_dir() -> Path:
    """Private / self-host mount point: ``<repo>/plugins/skills``."""
    return _repo_root() / "plugins" / "skills"


def _plugin_skills_dirs() -> list[Path]:
    """Configured + default plugin skill roots (exist on disk only)."""
    from app.core.config import settings

    out: list[Path] = []
    seen: set[str] = set()

    def _add(root: Path) -> None:
        try:
            if not root.is_dir():
                return
            key = str(root.resolve()).lower()
        except Exception:
            return
        if key in seen:
            return
        seen.add(key)
        out.append(root)

    _add(_default_plugin_skills_dir())
    raw = str(getattr(settings, "design_skills_plugin_dirs", "") or "").strip()
    for part in raw.split(","):
        p = part.strip()
        if not p:
            continue
        path = Path(p)
        if not path.is_absolute():
            path = _repo_root() / path
        _add(path)
    return out


def _file_skills_dir() -> Path:
    """Primary design_skills dir under apps/api/seeds/."""
    from app.core.config import resolve_seed_dir

    return resolve_seed_dir("design_skills")

def _file_skills_dirs() -> list[Path]:
    """``seeds/design_skills`` + ``plugins/skills`` (+ env dirs).

    Product skills live only under seeds (shipped) and plugins (private mount).
    ``.agents/skills`` is IDE/Cursor tooling — not scanned by the Design Agent.

    Later roots win on duplicate ``skill_key`` (private plugins override shipped packs).
    """
    from app.core.config import api_seeds_dir

    dirs: list[Path] = []
    seen: set[str] = set()
    for root in (
        api_seeds_dir() / "design_skills",
        *_plugin_skills_dirs(),
    ):
        try:
            resolved = root.resolve()
        except Exception:
            continue
        key = str(resolved).lower()
        if key in seen or not root.is_dir():
            continue
        seen.add(key)
        dirs.append(root)
    return dirs

def _pack_has_product_meta(pack_dir: Path) -> bool:
    return any((pack_dir / name).is_file() for name in _META_NAMES)


def _normalize_pack_meta(meta: dict[str, Any], *, folder: str) -> dict[str, Any] | None:
    """Normalize extension-friendly aliases onto the product skill meta shape.

    Accepts optional plugin-style fields (``id``, ``trigger_keywords``, ``enabled``,
    ``author``, ``permissions``) without requiring a separate plugin runtime.
    Returns ``None`` when the pack is disabled.
    """
    out = dict(meta)
    if "enabled" in out and out.get("enabled") in (False, "false", "0", 0, "no", "off"):
        return None

    if not str(out.get("skill_key") or out.get("skillKey") or "").strip():
        alt = str(out.get("id") or out.get("name") or folder or "").strip()
        if alt:
            out["skill_key"] = alt

    # Shortcut keywords → create-intent trigger (only when triggers absent).
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
    # Map a few Chinese/English labels onto allowed_resources when unset.
    if out.get("allowed_resources") is None and out.get("allowedResources") is None:
        perms = out.get("permissions")
        if isinstance(perms, list) and perms:
            out["allowed_resources"] = ["tools"]

    author = str(out.get("author") or "").strip()
    if author:
        out["_author"] = author
    return out


# Legacy SOURCE_SEED / core-reserved path removed — skills ship as file packs only.
_SEED: list[dict[str, Any]] = []
_SEED_BY_KEY: dict[str, dict[str, Any]] = {}
_CORE_RESERVED_KEYS: frozenset[str] = frozenset()

def _parse_pack_version(raw: Any) -> tuple[str, int]:
    """Return (label, sortable int). Accepts 1 / '1' / '1.0.0'."""
    s = str(raw if raw is not None else "1").strip() or "1"
    if re.fullmatch(r"-?\d+", s):
        return s, max(1, int(s))
    m = re.match(r"^(\d+)(?:\.(\d+))?(?:\.(\d+))?", s)
    if m:
        major = int(m.group(1))
        minor = int(m.group(2) or 0)
        patch = int(m.group(3) or 0)
        return s, max(1, major * 1_000_000 + minor * 1_000 + patch)
    return s, 1

def _read_json_file(path: Path) -> dict[str, Any] | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None
    return data if isinstance(data, dict) else None

def _locale_pick(
    locales: Any, *, prefer: tuple[str, ...] = ("zh-CN", "zh", "en-US", "en")
) -> dict[str, Any]:
    if not isinstance(locales, dict):
        return {}
    for key in prefer:
        block = locales.get(key)
        if isinstance(block, dict):
            return block
    for block in locales.values():
        if isinstance(block, dict):
            return block
    return {}

def _resolve_pack_logo(pack_dir: Path, meta: dict[str, Any]) -> str:
    """Return path relative to design_skills root, or absolute URL, or ''."""
    raw = str(meta.get("logo") or "").strip()
    if raw.startswith(("http://", "https://", "data:")):
        return raw
    candidates: list[Path] = []
    if raw:
        p = Path(raw)
        # Never accept absolute paths outside the pack (path traversal / leakage).
        if p.is_absolute():
            return ""
        candidates.append(pack_dir / p)
        candidates.append(pack_dir / Path(raw).name)
    key = pack_dir.name
    candidates.extend(
        [
            pack_dir / "assets" / "logo.png",
            pack_dir / "assets" / "logo.svg",
            pack_dir / "assets" / "logo.webp",
            pack_dir / "assets" / "icon.svg",
            pack_dir / "assets" / "icon.png",
            pack_dir / f"{key}-logo.png",
            pack_dir / f"{key}-logo.svg",
            pack_dir / f"{key}-logo.webp",
            pack_dir / f"{key}-logo.jpg",
            pack_dir / "logo.png",
            pack_dir / "logo.svg",
            pack_dir / "logo.webp",
            pack_dir / "logo.jpg",
        ]
    )
    root = pack_dir.parent.resolve()
    for cand in candidates:
        try:
            if not cand.is_file():
                continue
            resolved = cand.resolve()
            try:
                rel = resolved.relative_to(root)
                return rel.as_posix()
            except ValueError:
                # Outside this pack's design_skills root — deny.
                continue
        except Exception:
            continue
    return ""

def _skill_item_from_parts(
    *,
    pack_dir: Path,
    meta: dict[str, Any],
    body: str,
    skill_md_path: Path,
) -> dict[str, Any] | None:
    """Build skill dict from _meta.json + SKILL.md body."""
    from .schema import validate_skill_meta

    folder = pack_dir.name
    # _meta.json: `name` is technical id; displayName lives in locales.
    key = str(meta.get("skill_key") or meta.get("skillKey") or meta.get("name") or folder).strip()
    if not key or key in _SEED_BY_KEY:
        return None
    locales = meta.get("locales") if isinstance(meta.get("locales"), dict) else {}
    loc = _locale_pick(locales)
    display = str(
        loc.get("displayName")
        or loc.get("display_name")
        or meta.get("displayName")
        or meta.get("display_name")
        or meta.get("title")
        or key
    ).strip() or key
    description = str(
        loc.get("description")
        or meta.get("description")
        or meta.get("when_to_use")
        or meta.get("whenToUse")
        or ""
    ).strip()
    when = str(meta.get("when_to_use") or meta.get("whenToUse") or description).strip()
    pos = body.strip()
    if not pos:
        return None
    pack_label, ver_int = _parse_pack_version(meta.get("version") or meta.get("pack_version") or 1)
    logo = _resolve_pack_logo(pack_dir, meta)
    ns_prefix, stripped = split_namespace_key(key)
    if ns_prefix == NS_CORE:
        return None
    storage_key = qualify_skill_key(NS_EXT, stripped or key) if ns_prefix == NS_EXT else (
        stripped or key
    )
    # Bare file-pack keys stay bare for BC; namespace column still marks ext.
    if not ns_prefix:
        storage_key = (stripped or key).strip().lower()
    if storage_key in _SEED_BY_KEY or (stripped or key) in _SEED_BY_KEY:
        return None
    meta_errs = validate_skill_meta(
        {
            "skill_key": storage_key,
            "name": display,
            "prompt_positive": pos,
            "preferred_tools": meta.get("preferred_tools") or meta.get("preferredTools") or [],
            "allowed_resources": meta.get("allowed_resources")
            or meta.get("allowedResources"),
            "input_schema": meta.get("input_schema") or meta.get("inputSchema"),
            "output_schema": meta.get("output_schema") or meta.get("outputSchema"),
            "namespace": NS_EXT,
        },
        source=SOURCE_FILE,
    )
    if meta_errs:
        logger.warning("skip skill pack %s: %s", pack_dir.name, ",".join(meta_errs))
        return None
    return {
        "skill_key": storage_key,
        "name": display,
        "description": description,
        "category": str(meta.get("category") or "agent").strip() or "agent",
        "when_to_use": when,
        "prompt_positive": pos,
        "prompt_negative": str(meta.get("prompt_negative") or meta.get("promptNegative") or "").strip(),
        "scenes": str(meta.get("scenes") or "all").strip() or "all",
        "sort_weight": int(meta.get("sort_weight") or meta.get("sortWeight") or 0),
        "preferred_tools": meta.get("preferred_tools") or meta.get("preferredTools") or [],
        "allowed_resources": meta.get("allowed_resources")
        or meta.get("allowedResources"),
        "input_schema": meta.get("input_schema") or meta.get("inputSchema"),
        "output_schema": meta.get("output_schema") or meta.get("outputSchema"),
        "triggers": meta.get("triggers") or [],
        "mutex_group": str(meta.get("mutex_group") or meta.get("mutexGroup") or "").strip(),
        "version": ver_int,
        "pack_version": pack_label,
        "logo": logo,
        "locales": locales if isinstance(locales, dict) else {},
        "source": SOURCE_FILE,
        "namespace": NS_EXT,
        "_path": str(skill_md_path),
        "_pack": str(pack_dir),
        **(
            {"author": str(meta.get("_author") or meta.get("author") or "").strip()}
            if str(meta.get("_author") or meta.get("author") or "").strip()
            else {}
        ),
    }

def _load_schema_json(pack_dir: Path) -> tuple[Any, Any]:
    """Optional ``schema.json`` → (input_schema, output_schema)."""
    path = pack_dir / "schema.json"
    if not path.is_file():
        return None, None
    data = _read_json_file(path)
    if not data:
        return None, None
    inp = data.get("input_schema") or data.get("input") or data.get("inputSchema")
    out = data.get("output_schema") or data.get("output") or data.get("outputSchema")
    # Whole file is a single object schema → treat as input.
    if inp is None and out is None and ("type" in data or "properties" in data):
        inp = data
    return inp, out


def _note_deferred_handler(pack_dir: Path) -> None:
    """``handler.py`` is reserved for Phase B ops runners — do not execute yet."""
    if (pack_dir / "handler.py").is_file():
        logger.info(
            "skill pack %s has handler.py (ignored until skill runner Phase B)",
            pack_dir.name,
        )


def _load_pack_dir(pack_dir: Path) -> dict[str, Any] | None:
    """Load one skill pack: ``_meta.json`` + ``SKILL.md``, optional ``schema.json``."""
    if not pack_dir.is_dir():
        return None
    skill_md = _skill_md_path(pack_dir)
    if not skill_md:
        return None
    try:
        raw = skill_md.read_text(encoding="utf-8")
    except Exception:
        return None
    fm, body = _split_skill_md_frontmatter(raw)
    if not body:
        return None
    meta: dict[str, Any] | None = None
    for name in _META_NAMES:
        p = pack_dir / name
        if p.is_file():
            meta = _read_json_file(p)
            if meta:
                break
    if not meta:
        meta = _meta_from_agent_skill_frontmatter(fm, folder=pack_dir.name)
    if not meta:
        return None
    meta = _normalize_pack_meta(meta, folder=pack_dir.name)
    if not meta:
        return None

    schema_in, schema_out = _load_schema_json(pack_dir)
    if schema_in is not None and not (
        meta.get("input_schema") or meta.get("inputSchema")
    ):
        meta["input_schema"] = schema_in
    if schema_out is not None and not (
        meta.get("output_schema") or meta.get("outputSchema")
    ):
        meta["output_schema"] = schema_out

    _note_deferred_handler(pack_dir)
    return _skill_item_from_parts(
        pack_dir=pack_dir,
        meta=meta,
        body=body,
        skill_md_path=skill_md,
    )


def _load_file_skills() -> list[dict[str, Any]]:
    """Scan design_skills + plugins/skills → skill dicts (later roots win)."""
    by_key: dict[str, dict[str, Any]] = {}
    for root in _file_skills_dirs():
        for pack_dir in sorted(p for p in root.iterdir() if p.is_dir()):
            item = _load_pack_dir(pack_dir)
            if not item:
                continue
            key = str(item.get("skill_key") or "").strip()
            if not key:
                continue
            by_key[key] = item
    return list(by_key.values())
