"""Canvas text layer styling after intelligence OCR blocks are returned."""

from __future__ import annotations

import base64
import re
from typing import Any

import httpx

_CJK_RE = re.compile(r"[\u3400-\u9fff]")


def _num(v: Any, fallback: float = 0.0) -> float:
    try:
        n = float(v)
        return n if n == n else fallback
    except (TypeError, ValueError):
        return fallback


async def load_bgr(image_ref: str):
    """Decode data URL or https URL → BGR ndarray."""
    import cv2
    import numpy as np

    ref = (image_ref or "").strip()
    if not ref:
        raise ValueError("image is required")

    raw: bytes
    if ref.startswith("data:"):
        try:
            _, b64 = ref.split(",", 1)
        except ValueError as exc:
            raise ValueError("invalid data URL") from exc
        raw = base64.b64decode(b64)
    elif ref.startswith("http://") or ref.startswith("https://"):
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=20.0)) as client:
            resp = await client.get(ref)
            if resp.status_code >= 400:
                raise ValueError(f"failed to download image ({resp.status_code})")
            raw = resp.content
    else:
        raise ValueError("image must be a data URL or https URL")

    arr = np.frombuffer(raw, dtype=np.uint8)
    bgr = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if bgr is None:
        raise ValueError("could not decode image")
    return bgr


def _sample_ink_color(bgr, block: dict[str, Any]) -> str:
    import cv2
    import numpy as np

    h, w = bgr.shape[:2]
    x = int(max(0, _num(block.get("x"))))
    y = int(max(0, _num(block.get("y"))))
    bw = int(max(1, _num(block.get("width"), 1)))
    bh = int(max(1, _num(block.get("height"), 1)))
    x2, y2 = min(w, x + bw), min(h, y + bh)
    crop = bgr[y:y2, x:x2]
    if crop.size == 0:
        return "#333333"

    small = cv2.resize(crop, (max(8, crop.shape[1] // 2), max(8, crop.shape[0] // 2)))
    pixels = small.reshape(-1, 3).astype(np.float32)
    lum = pixels[:, 0] * 0.114 + pixels[:, 1] * 0.587 + pixels[:, 2] * 0.299
    bg_idx = int(np.argmax(lum))
    bg = pixels[bg_idx]
    dark = pixels[lum < np.percentile(lum, 45)]
    if len(dark) < 4:
        dark = pixels
    dist = np.linalg.norm(dark - bg, axis=1)
    ink = dark[int(np.argmax(dist))]
    b, g, r = [int(max(0, min(255, round(c)))) for c in ink]
    return f"#{r:02X}{g:02X}{b:02X}"


def _estimate_font(block: dict[str, Any], fill: str) -> dict[str, Any]:
    text = str(block.get("text") or "")
    h = max(1.0, _num(block.get("height"), 14))
    w = max(1.0, _num(block.get("width"), 14))
    font_size = max(10.0, round(_num(block.get("font_size"), h * 0.78), 1))
    cjk = bool(_CJK_RE.search(text))
    latin = bool(re.search(r"[A-Za-z]", text))
    chars = max(1, len(text.strip()))
    avg_char_w = w / chars
    bold = font_size >= 28 or (avg_char_w / max(font_size, 1) > 0.95 and font_size >= 18)

    if cjk and not latin:
        if bold or font_size >= 36:
            family = "Alibaba PuHuiTi Bold" if bold else "SimHei"
            weight = "bold" if bold else "normal"
            if font_size >= 48:
                family = "Alibaba PuHuiTi Bold"
                weight = "bold"
        elif font_size <= 14:
            family = "SimSun"
            weight = "normal"
        else:
            family = "Alibaba PuHuiTi"
            weight = "normal"
    elif latin and not cjk:
        family = "Arial"
        weight = "bold" if bold else "normal"
        if avg_char_w / max(font_size, 1) < 0.45 and font_size >= 20:
            family = "Georgia"
    else:
        family = "Alibaba PuHuiTi"
        weight = "bold" if bold else "normal"

    return {
        "fontSize": font_size,
        "fontFamily": family,
        "fontWeight": weight,
        "fill": fill,
        "lineHeight": 1.25,
    }


def enrich_text_layers(bgr, texts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Map OCR blocks → canvas-ready text layers with font/color."""
    out: list[dict[str, Any]] = []
    for block in texts:
        if str(block.get("type") or "") != "text":
            continue
        text = str(block.get("text") or "").strip()
        if not text:
            continue
        fill = _sample_ink_color(bgr, block)
        style = _estimate_font(block, fill)
        out.append(
            {
                "type": "text",
                "text": text,
                "x": _num(block.get("x")),
                "y": _num(block.get("y")),
                "width": max(8.0, _num(block.get("width"), 40)),
                "height": max(8.0, _num(block.get("height"), 14)),
                "name": "文字",
                **style,
            }
        )
    return out
