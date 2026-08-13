"""One-shot: classify seeds/design_skills into skills/foundation|domains."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEEDS = ROOT / "apps" / "api" / "seeds" / "design_skills"
FOUNDATION_DIR = ROOT / "skills" / "foundation"
DOMAINS_DIR = ROOT / "skills" / "domains"

FOUNDATION = {
    "design_brief",
    "visual_direction",
    "design_system",
    "composition",
    "typography",
    "color",
    "imagery",
    "layout",
    "responsive",
    "anti_ai_slop",
    "design_review",
    "polish",
}

# Named domains from the public catalog; everything else surface → domains.
NAMED_DOMAINS = {
    "poster_craft",
    "landing_page",
    "dashboard_ui",
    "image_gen",
    "presentation",
    "social_media",
}


def main() -> None:
    FOUNDATION_DIR.mkdir(parents=True, exist_ok=True)
    DOMAINS_DIR.mkdir(parents=True, exist_ok=True)
    if not SEEDS.is_dir():
        raise SystemExit(f"missing {SEEDS}")

    for pack in sorted(SEEDS.iterdir()):
        if not pack.is_dir() or pack.name.startswith("."):
            continue
        meta_path = pack / "_meta.json"
        category = ""
        if meta_path.is_file():
            try:
                category = str(json.loads(meta_path.read_text(encoding="utf-8")).get("category") or "")
            except Exception:
                category = ""
        if pack.name in FOUNDATION or category == "foundation":
            dest_root = FOUNDATION_DIR
        else:
            dest_root = DOMAINS_DIR
        dest = dest_root / pack.name
        if dest.exists():
            print(f"skip exists {dest.relative_to(ROOT)}")
            continue
        print(f"move {pack.name} -> {dest.relative_to(ROOT)} (cat={category or '?'})")
        shutil.move(str(pack), str(dest))

    # Leave a pointer so old docs/paths are not a dead end.
    readme = SEEDS / "README.md"
    if not readme.exists():
        readme.write_text(
            "# Legacy path\n\n"
            "Shipped Design Agent skills live under repo-root "
            "`skills/foundation` and `skills/domains`.\n"
            "This directory is kept for backward-compatible empty mounts.\n",
            encoding="utf-8",
        )


if __name__ == "__main__":
    main()
