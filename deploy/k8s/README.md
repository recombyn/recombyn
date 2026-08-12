# Kubernetes manifests

**Status:** deferred (ADR 0004 / 0009).

OSS default deploy is **Docker Compose** + optional **GHCR** images (`docker-compose.yml`, `docker-compose.ghcr.yml`). Multi-AZ k8s manifests will land here only when an operator needs them and the compose path is stable.

Until then: use [docs/self-hosting.md](../docs/self-hosting.md).
