"""Decompose a board raster into vision layers (reuses toolbar vision stack)."""

from __future__ import annotations

import logging
from typing import Any

_log = logging.getLogger(__name__)


async def decompose_board_layers(*, image: str) -> dict[str, Any]:
    """
    Full editElements split when OCR is available; otherwise one image layer.

    Shape matches ``vision.image_edit.decompose_image``:
    ``{ layers, width, height, engines, warnings, image }``.
    """
    from app.services.vision.ocr import available as ocr_available

    if not ocr_available():
        _log.info("img_layers: OCR unavailable — single-image fallback")
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
            "warnings": ["OCR unavailable — placed as a single image layer"],
        }

    from app.services.vision.image_edit import decompose_image

    try:
        return await decompose_image(kind="editElements", image=image)
    except Exception as err:  # noqa: BLE001
        _log.exception("img_layers decompose failed: %s", err)
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
            "engines": ["fallback:error"],
            "warnings": [f"decompose failed: {err}"[:200]],
        }
