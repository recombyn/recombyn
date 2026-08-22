"""Decompose a board raster into layers (OSS: single-image fallback)."""

from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger(__name__)


async def decompose_board_layers(*, image: str) -> dict[str, Any]:
    """Return one raster layer when industrial decompose is unavailable."""
    _log.info("img_layers: single-image fallback")
    return {
        "image": image,
        "layers": [
            {
                "type": "image",
                "src": image,
                "x": 0,
                "y": 0,
                "width": 0,
                "height": 0,
                "name": "整板",
            }
        ],
        "kind": "editElements",
        "width": 0,
        "height": 0,
        "engines": ["fallback:single"],
        "warnings": [],
    }
