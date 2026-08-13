"""Open .recombyn-plugin manifest helpers."""

from __future__ import annotations

from recombyn_plugin_sdk.manifest import (
    FORMAT,
    FORMAT_NAME,
    INSTALL_TARGETS,
    KINDS,
    PLUGIN_JSON,
    PLUGIN_SIG,
    parse_plugin_manifest,
    slug_plugin_id,
)

__all__ = [
    "FORMAT",
    "FORMAT_NAME",
    "INSTALL_TARGETS",
    "KINDS",
    "PLUGIN_JSON",
    "PLUGIN_SIG",
    "parse_plugin_manifest",
    "slug_plugin_id",
]
