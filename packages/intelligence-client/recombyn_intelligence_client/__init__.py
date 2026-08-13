"""Open Design Intelligence client.

Runtime talks to a DesignIntelligenceClient. Operators supply an
IntelligenceProvider (default: local basic). Proprietary provider
implementations are out of scope for this package and must not be
documented in the public repository.
"""

from __future__ import annotations

from recombyn_intelligence_client.client import DesignIntelligenceClient
from recombyn_intelligence_client.protocol import IntelligenceProvider

__all__ = [
    "DesignIntelligenceClient",
    "IntelligenceProvider",
]
