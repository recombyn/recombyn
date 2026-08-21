"""Project version history — create / list / restore."""

from __future__ import annotations

import uuid

import pytest

from app.core.db import reset_engine
from app.services import project_versions as version_store
from app.services import projects as project_store
from app.services.projects import ProjectConflictError
from tests.conftest import restore_default_sqlite_engine


@pytest.fixture()
def user_id(tmp_path, monkeypatch):
    db = tmp_path / f"versions_{uuid.uuid4().hex[:8]}.db"
    monkeypatch.setenv("SQLITE_DB_PATH", str(db))
    monkeypatch.delenv("DATABASE_URL", raising=False)
    from app.core import config

    monkeypatch.setattr(config.settings, "database_url", "")
    monkeypatch.setattr(config.settings, "sqlite_db_path", str(db))
    reset_engine()
    try:
        yield f"u_{uuid.uuid4().hex[:10]}"
    finally:
        restore_default_sqlite_engine()


def _doc(label: str) -> dict:
    nid = f"n_{label}"
    return {
        "width": 800,
        "height": 600,
        "pages": [{"id": "page", "children": [nid]}],
        "frames": [],
        "deltaSetLike": {
            nid: {
                "id": nid,
                "key": "rect",
                "x": 10,
                "y": 10,
                "width": 100,
                "height": 80,
                "attrs": {"fill": label},
            }
        },
        "stackOrder": [f"node:{nid}"],
    }


def test_create_list_restore_version(user_id):
    created = project_store.upsert_project(
        user_id,
        project_id=None,
        name="Version demo",
        document=_doc("v1"),
    )
    pid = created["id"]
    rev1 = int(created["revision"])

    v = version_store.create_version(
        user_id,
        pid,
        name="Milestone A",
        kind="named",
    )
    assert v["name"] == "Milestone A"
    assert v["kind"] == "named"
    assert v["sourceRevision"] == rev1

    # Advance live doc
    project_store.upsert_project(
        user_id,
        project_id=pid,
        name="Version demo",
        document=_doc("v2"),
        base_revision=rev1,
    )

    listed = version_store.list_versions(user_id, pid)
    assert listed["total"] >= 1
    assert listed["items"][0]["id"] == v["id"]

    live = project_store.get_project(user_id, pid)
    assert live is not None
    rev2 = int(live["revision"])

    restored = version_store.restore_version(
        user_id,
        pid,
        v["id"],
        base_revision=rev2,
        create_backup=True,
    )
    assert restored["backupVersion"] is not None
    assert restored["backupVersion"]["kind"] == "auto"
    fill = restored["document"]["deltaSetLike"]["n_v1"]["attrs"]["fill"]
    assert fill == "v1"

    with pytest.raises(ProjectConflictError):
        version_store.restore_version(
            user_id,
            pid,
            v["id"],
            base_revision=rev2,
            create_backup=False,
        )


def test_named_limit(user_id, monkeypatch):
    monkeypatch.setattr(version_store, "_MAX_NAMED", 2)
    created = project_store.upsert_project(
        user_id,
        project_id=None,
        name="Cap",
        document=_doc("cap"),
    )
    pid = created["id"]
    version_store.create_version(user_id, pid, name="1", kind="named")
    version_store.create_version(user_id, pid, name="2", kind="named")
    with pytest.raises(version_store.ProjectVersionError) as exc:
        version_store.create_version(user_id, pid, name="3", kind="named")
    assert exc.value.code == "named_limit"
