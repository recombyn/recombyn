"""Tests for canvas text layer styling."""

from __future__ import annotations

import numpy as np

from app.services.vision.text_layer_style import enrich_text_layers


def test_enrich_text_layers_assigns_font_and_fill():
    bgr = np.full((40, 120, 3), 240, dtype=np.uint8)
    bgr[10:30, 20:100] = (20, 20, 20)
    layers = enrich_text_layers(
        bgr,
        [
            {
                "type": "text",
                "text": "标题",
                "x": 20.0,
                "y": 10.0,
                "width": 80.0,
                "height": 20.0,
                "font_size": 16.0,
            }
        ],
    )
    assert len(layers) == 1
    assert layers[0]["text"] == "标题"
    assert layers[0]["fontFamily"]
    assert str(layers[0]["fill"]).startswith("#")
