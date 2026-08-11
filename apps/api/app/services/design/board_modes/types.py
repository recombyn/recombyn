"""Board paint modes for Design Agent (ops vs img_layers)."""

from __future__ import annotations

from typing import Literal

PaintMode = Literal["ops", "img_layers"]

PAINT_MODE_OPS: PaintMode = "ops"
PAINT_MODE_IMG_LAYERS: PaintMode = "img_layers"
PAINT_MODES: frozenset[str] = frozenset({PAINT_MODE_OPS, PAINT_MODE_IMG_LAYERS})


def normalize_paint_mode(raw: str | None) -> PaintMode:
    mode = str(raw or "").strip().lower().replace("-", "_")
    if mode in ("img_layers", "imglayers", "image_layers", "gen_layers", "生图拆层"):
        return PAINT_MODE_IMG_LAYERS
    return PAINT_MODE_OPS
