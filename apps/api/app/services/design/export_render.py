"""Server-side artboard export (PNG / PDF) for async jobs (ADR 0005).

Not a full Fabric/SVG replay — composites artboard background, solid rects,
and image nodes. Interactive canvas export stays in the browser.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any

from app.services.plaza.cover import list_artboard_frames
from app.services.plaza.panel_png import _load_image_bytes, _to_png_bytes
from app.services.storage import get_storage, put_bytes

_log = logging.getLogger(__name__)

_MAX_EDGE = 4096
_MAX_FRAMES = 12


def _num(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _parse_color(raw: Any, default: tuple[int, int, int, int] = (255, 255, 255, 255)):
    s = str(raw or "").strip()
    if not s or s.lower() in ("none", "transparent"):
        return default
    if s.startswith("rgba"):
        inner = s[s.find("(") + 1 : s.rfind(")")]
        parts = [p.strip() for p in inner.split(",")]
        if len(parts) >= 3:
            r, g, b = (max(0, min(255, int(float(parts[i])))) for i in range(3))
            a = 255
            if len(parts) >= 4:
                a = max(0, min(255, int(float(parts[3]) * 255)))
            return (r, g, b, a)
        return default
    if s.startswith("rgb"):
        inner = s[s.find("(") + 1 : s.rfind(")")]
        parts = [p.strip() for p in inner.split(",")]
        if len(parts) >= 3:
            r, g, b = (max(0, min(255, int(float(parts[i])))) for i in range(3))
            return (r, g, b, 255)
        return default
    hex_s = s[1:] if s.startswith("#") else s
    if len(hex_s) == 3:
        hex_s = "".join(ch * 2 for ch in hex_s)
    if len(hex_s) == 6:
        try:
            n = int(hex_s, 16)
        except ValueError:
            return default
        return ((n >> 16) & 255, (n >> 8) & 255, n & 255, 255)
    if len(hex_s) == 8:
        try:
            n = int(hex_s, 16)
        except ValueError:
            return default
        return ((n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255)
    return default


def _iter_nodes(document: dict[str, Any]) -> list[dict[str, Any]]:
    dsl = document.get("deltaSetLike")
    if not isinstance(dsl, dict):
        return []
    out: list[dict[str, Any]] = []
    for key, raw in dsl.items():
        if key == "ROOT" or not isinstance(raw, dict):
            continue
        node = dict(raw)
        node["id"] = str(node.get("id") or key)
        out.append(node)
    return out


def _attrs(node: dict[str, Any]) -> dict[str, Any]:
    raw = node.get("attrs")
    return raw if isinstance(raw, dict) else {}


def _node_box(node: dict[str, Any]) -> tuple[float, float, float, float]:
    attrs = _attrs(node)
    x = _num(node.get("x"), _num(attrs.get("x")))
    y = _num(node.get("y"), _num(attrs.get("y")))
    w = max(1.0, _num(node.get("width"), _num(attrs.get("width"), 1.0)))
    h = max(1.0, _num(node.get("height"), _num(attrs.get("height"), 1.0)))
    return x, y, w, h


def _inside_frame(node: dict[str, Any], frame: dict[str, Any]) -> bool:
    x, y, w, h = _node_box(node)
    cx, cy = x + w / 2.0, y + h / 2.0
    fx = _num(frame.get("x"))
    fy = _num(frame.get("y"))
    fw = max(1.0, _num(frame.get("width"), 1.0))
    fh = max(1.0, _num(frame.get("height"), 1.0))
    return fx <= cx <= fx + fw and fy <= cy <= fy + fh


def _image_src(node: dict[str, Any]) -> str:
    attrs = _attrs(node)
    for key in ("src", "url", "href", "xlink:href"):
        raw = str(attrs.get(key) or node.get(key) or "").strip()
        if raw.startswith(("http://", "https://", "data:image/")):
            return raw
    return ""


def _fill_color(node: dict[str, Any]) -> tuple[int, int, int, int] | None:
    attrs = _attrs(node)
    raw = attrs.get("fill") or node.get("fill") or attrs.get("backgroundColor")
    if raw is None:
        return None
    s = str(raw).strip().lower()
    if not s or s in ("none", "transparent"):
        return None
    return _parse_color(raw, default=(0, 0, 0, 0))


def _fallback_frame(document: dict[str, Any]) -> dict[str, Any]:
    w = max(1.0, _num(document.get("width"), 794.0))
    h = max(1.0, _num(document.get("height"), 1123.0))
    bg = document.get("backgroundColor") or "#ffffff"
    return {
        "id": "frame_full",
        "name": "frame_full",
        "x": 0,
        "y": 0,
        "width": w,
        "height": h,
        "backgroundColor": bg,
    }


def _select_frames(document: dict[str, Any], frame_id: str | None) -> list[dict[str, Any]]:
    frames = list_artboard_frames(document)
    if not frames:
        frames = [_fallback_frame(document)]
    want = (frame_id or "").strip()
    if want:
        picked = [f for f in frames if str(f.get("id") or "") == want]
        if not picked:
            raise ValueError(f"frame not found: {want}")
        return picked[:_MAX_FRAMES]
    return frames[:_MAX_FRAMES]


def _scale_for(w: int, h: int) -> float:
    edge = max(w, h, 1)
    if edge <= _MAX_EDGE:
        return 1.0
    return _MAX_EDGE / float(edge)


def render_artboard_png(document: dict[str, Any], frame: dict[str, Any]) -> bytes:
    from PIL import Image, ImageDraw

    fw = max(1, int(round(_num(frame.get("width"), 1.0))))
    fh = max(1, int(round(_num(frame.get("height"), 1.0))))
    scale = _scale_for(fw, fh)
    cw, ch = max(1, int(round(fw * scale))), max(1, int(round(fh * scale)))
    bg = _parse_color(frame.get("backgroundColor") or document.get("backgroundColor") or "#ffffff")
    canvas = Image.new("RGBA", (cw, ch), bg)
    draw = ImageDraw.Draw(canvas)
    fx, fy = _num(frame.get("x")), _num(frame.get("y"))

    nodes = [n for n in _iter_nodes(document) if _inside_frame(n, frame)]
    nodes.sort(key=lambda n: int(_num(n.get("zIndex"), _num(_attrs(n).get("zIndex")))))

    for node in nodes:
        x, y, w, h = _node_box(node)
        dx = int(round((x - fx) * scale))
        dy = int(round((y - fy) * scale))
        dw = max(1, int(round(w * scale)))
        dh = max(1, int(round(h * scale)))
        src = _image_src(node)
        if src:
            blob = _load_image_bytes(src)
            png = _to_png_bytes(blob, max_edge=_MAX_EDGE) if blob else None
            if not png:
                continue
            im = Image.open(io.BytesIO(png)).convert("RGBA")
            im = im.resize((dw, dh), Image.Resampling.LANCZOS)
            canvas.alpha_composite(im, (dx, dy))
            continue
        fill = _fill_color(node)
        if fill is None:
            continue
        draw.rectangle([dx, dy, dx + dw, dy + dh], fill=fill)

    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG", optimize=True)
    return out.getvalue()


def _pngs_to_pdf(pages: list[bytes]) -> bytes:
    from PIL import Image

    images = [Image.open(io.BytesIO(p)).convert("RGB") for p in pages]
    if not images:
        raise ValueError("no pages to export")
    buf = io.BytesIO()
    first, rest = images[0], images[1:]
    first.save(buf, format="PDF", save_all=bool(rest), append_images=rest)
    return buf.getvalue()


def _safe_key_part(value: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9._-]+", "-", (value or "").strip())[:80]
    return s or "export"


def render_and_store_export(
    *,
    document: dict[str, Any],
    user_id: str,
    job_id: str,
    fmt: str,
    frame_id: str | None = None,
) -> dict[str, Any]:
    """Render artboards and persist. Returns result dict for the job record."""
    if not isinstance(document, dict):
        raise ValueError("document required")
    kind = (fmt or "png").strip().lower()
    if kind not in ("png", "pdf"):
        raise ValueError("format must be png or pdf")
    frames = _select_frames(document, frame_id)
    pages = [render_artboard_png(document, frame) for frame in frames]
    if not pages:
        raise ValueError("nothing to export")

    if kind == "pdf":
        payload = _pngs_to_pdf(pages)
        ext, content_type = "pdf", "application/pdf"
    else:
        payload = pages[0]
        ext, content_type = "png", "image/png"

    key = f"exports/{_safe_key_part(user_id)}/{_safe_key_part(job_id)}/export.{ext}"
    put_bytes(key, payload, content_type=content_type, cache_control="private, max-age=86400")
    storage = get_storage()
    url = storage.url_for(key)
    return {
        "key": key,
        "url": url,
        "contentType": content_type,
        "bytes": len(payload),
        "pages": len(pages),
        "format": kind,
    }
