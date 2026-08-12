# Optional Kubernetes deploy (GHCR images)

**Status:** available as a thin starter (ADR 0012). Compose remains the default OSS path.

Images (from `release-docker.yml` tags):

- `ghcr.io/<owner>/<repo>/api:<tag>`
- `ghcr.io/<owner>/<repo>/web:<tag>`
- `ghcr.io/<owner>/<repo>/collab:<tag>`

## Apply (example)

```bash
export IMAGE_REGISTRY=ghcr.io/recombyn/recombyn
export IMAGE_TAG=v0.1.0
# Fill secrets in secret.example.yaml → secret.yaml (do not commit)
kubectl apply -f deploy/k8s/namespace.yaml
kubectl apply -f deploy/k8s/configmap.yaml
kubectl apply -f deploy/k8s/secret.yaml
kubectl apply -f deploy/k8s/redis.yaml
kubectl apply -f deploy/k8s/api.yaml
kubectl apply -f deploy/k8s/worker.yaml
kubectl apply -f deploy/k8s/collab.yaml
kubectl apply -f deploy/k8s/web.yaml
```

MySQL is **not** included — point `DATABASE_URL` at a managed instance or an in-cluster operator of your choice.

See [docs/self-hosting.md](../../docs/self-hosting.md) for Compose.
