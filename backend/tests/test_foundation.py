from datetime import date

from fastapi.testclient import TestClient
import pytest
import sqlalchemy as sa
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext

from backend.app import api, income_api
from backend.app.db import ROOT, engine_for, migrate
from backend.app.main import create_app
from backend.app.models import Base


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "test.sqlite3")) as connection:
        yield connection


def test_migration_and_seed(tmp_path):
    engine = engine_for(tmp_path / "migration.sqlite3")
    try:
        migrate(engine)
        migrate(engine)
        with engine.connect() as connection:
            assert compare_metadata(MigrationContext.configure(connection), Base.metadata) == []
            assert connection.scalar(sa.text("SELECT version_num FROM alembic_version")) == "0008"
            assert connection.scalar(sa.text("SELECT count(*) FROM classifications")) == 56
    finally:
        engine.dispose()


def test_settings_persist_between_servers(tmp_path):
    path = tmp_path / "persist.sqlite3"
    with TestClient(create_app(path)) as client:
        defaults = client.get("/api/settings").json()
        assert defaults["salary_cents"] == 1_401_487
        assert defaults["extraordinary_cents"] == 0
        assert defaults["payday"] is None
        assert defaults["opening_reserve_cents"] is None
        changes = {**defaults, "name": "Casa", "theme": "dark", "opening_cash_cents": -123_456}
        response = client.put("/api/settings", json=changes)
        assert response.status_code == 200
    with TestClient(create_app(path)) as restarted:
        assert restarted.get("/api/settings").json() == changes


def test_invalid_settings_leave_existing_values(client):
    defaults = client.get("/api/settings").json()
    for changes in ({"salary_cents": 15.42}, {"alert_near": 30}, {"name": "   "}, {"payday": 32},
                    {"projection_months": 12}, {"opening_reserve_cents": -1}):
        assert client.put("/api/settings", json={**defaults, **changes}).status_code == 422
    assert client.get("/api/settings").json() == defaults


def test_salary_revisions_preserve_past(client, monkeypatch):
    monkeypatch.setattr(api, "current_month", lambda: date(2026, 11, 1))
    revision = {"effective_month": "2027-11-01", "amount_cents": 1_500_021}
    assert client.post("/api/salary-revisions", json=revision).status_code == 201
    assert client.post("/api/salary-revisions", json=revision).status_code == 409
    assert client.post("/api/salary-revisions", json={**revision, "effective_month": "2026-11-01"}).status_code == 422
    assert client.get("/api/salary?month=2027-10").json()["amount_cents"] == 1_401_487
    assert client.get("/api/salary?month=2027-11").json()["amount_cents"] == 1_500_021
    assert client.get("/api/salary?month=2027-12").json()["amount_cents"] == 1_500_021
    assert client.get("/api/salary?month=2027-13").status_code == 422
    path = "/api/salary-revisions/2027-11-01"
    assert client.put(path, json={**revision, "amount_cents": 1_500_022}).status_code == 200
    monkeypatch.setattr(api, "current_month", lambda: date(2027, 11, 1))
    assert client.delete(path).status_code == 422
    assert client.get("/api/salary").json()["amount_cents"] == 1_500_022


def test_income_uses_salary_in_effect_and_credits_only_in_their_month(client, monkeypatch):
    monkeypatch.setattr(api, "current_month", lambda: date(2026, 11, 1))
    revision = {"effective_month": "2027-01-01", "amount_cents": 1_600_000}
    assert client.post("/api/salary-revisions", json=revision).status_code == 201
    credits = "/api/income/credits"
    credit = {"month": "2027-01-01", "description": "Reembolso", "amount_cents": 20_001}
    created = client.post(credits, json=credit)
    assert created.status_code == 201, created.text
    assert client.post(credits, json={**credit, "description": "Bônus", "amount_cents": 50_002}).status_code == 201
    assert client.post(credits, json={**credit, "month": "2027-01-02"}).status_code == 422
    assert client.post(credits, json={**credit, "amount_cents": 0}).status_code == 422
    january = client.get("/api/income?month=2027-01").json()
    assert january["salary_cents"] == 1_600_000
    assert january["credits_cents"] == 70_003
    assert january["total_cents"] == 1_670_003
    assert client.get("/api/income?month=2026-12").json()["total_cents"] == 1_401_487
    assert client.get("/api/income?month=2027-02").json()["total_cents"] == 1_600_000

    path = f"{credits}/{created.json()['id']}"
    assert client.put(path, json={**credit, "month": "2027-02-01"}).status_code == 200
    assert client.get("/api/income?month=2027-01").json()["credits_cents"] == 50_002
    assert client.get("/api/income?month=2027-02").json()["credits_cents"] == 20_001
    assert client.delete(path).status_code == 204
    assert client.get("/api/income?month=2027-02").json()["credits_cents"] == 0


def test_undated_legacy_income_is_preserved_until_month_is_assigned(tmp_path):
    path = tmp_path / "legacy-income.sqlite3"
    engine = engine_for(path)
    config = Config()
    config.set_main_option("script_location", str(ROOT / "backend" / "migrations").replace("%", "%%"))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            config.attributes["connection"] = connection
            command.upgrade(config, "0005")
            connection.exec_driver_sql("UPDATE settings SET extraordinary_cents = 25_000 WHERE id = 1")
    finally:
        engine.dispose()

    with TestClient(create_app(path)) as client:
        data = client.get("/api/income?month=2026-11").json()
        assert client.get("/api/settings").json()["extraordinary_cents"] == 0
        assert data["credits_cents"] == 0
        old, = data["unassigned"]
        assert old["month"] is None and old["amount_cents"] == 25_000 and old["kind"] == "avulso"
        assert client.put(f"/api/income/credits/{old['id']}", json={
            "month": "2026-11-01", "description": old["description"], "amount_cents": old["amount_cents"],
        }).status_code == 200
        saved = client.get("/api/income?month=2026-11").json()
        assert saved["credits_cents"] == 25_000
        assert saved["unassigned"] == []


def test_fixed_credit_uses_inclusive_dates_and_shares_tags(client, monkeypatch):
    monkeypatch.setattr(income_api, "local_date", lambda: date(2026, 11, 20))
    tag = client.post("/api/tags", json={"name": "Renda extra"}).json()
    route = "/api/income/credits"
    data = {"kind": "fixo", "occurred_on": "2026-12-31", "ends_on": "2027-02-10",
            "amount_cents": 14_025, "description": "Projeto", "tag_ids": [tag["id"]]}
    assert client.post(route, json={**data, "occurred_on": None}).status_code == 422
    assert client.post(route, json={**data, "ends_on": "2026-12-30"}).status_code == 422
    assert client.post(route, json={**data, "tag_ids": [99999]}).status_code == 422
    saved = client.post(route, json=data)
    assert saved.status_code == 201, saved.text
    assert saved.json()["can_close"] is False
    assert client.get("/api/income?month=2026-11").json()["credits"] == []
    assert client.post(route, json={"occurred_on": "2027-01-15", "amount_cents": 25_075}).status_code == 201
    january = client.get("/api/income?month=2027-01").json()
    assert january["credits_cents"] == 39_100
    fixed, single = january["credits"]
    assert fixed["id"] == saved.json()["id"] and fixed["tags"] == [tag]
    assert fixed["occurred_on"] == "2027-01-31" and single["occurred_on"] == "2027-01-15"
    assert client.get("/api/income?month=2027-02").json()["credits"][0]["occurred_on"] == "2027-02-10"
    assert client.get("/api/income?month=2027-03").json()["credits"] == []
    assert client.delete(f"/api/tags/{tag['id']}").status_code == 409


def test_open_credit_can_end_and_edits_keep_previous_months(client, monkeypatch):
    monkeypatch.setattr(income_api, "local_date", lambda: date(2026, 11, 20))
    data = {"kind": "fixo", "occurred_on": "2026-09-30", "amount_cents": 40_000}
    saved = client.post("/api/income/credits", json=data)
    assert saved.status_code == 201, saved.text
    assert client.get("/api/income?month=2029-10").json()["credits_cents"] == 40_000
    assert client.get("/api/income?month=2029-11").json()["credits_cents"] == 0
    past_path = f"/api/income/credits/{saved.json()['id']}"
    assert client.delete(past_path).status_code == 409
    updated = client.put(past_path, json={**data, "amount_cents": 50_000})
    assert updated.status_code == 200, updated.text
    current_path = f"/api/income/credits/{updated.json()['id']}"
    assert current_path != past_path
    assert client.get("/api/income?month=2026-10").json()["credits_cents"] == 40_000
    assert client.get("/api/income?month=2026-11").json()["credits_cents"] == 50_000
    assert client.post(f"{current_path}/close", json={"closed_on": "2026-10-20"}).status_code == 422
    assert client.post(f"{current_path}/close", json={"closed_on": "2026-12-10"}).status_code == 204
    december = client.get("/api/income?month=2026-12").json()
    assert december["credits_cents"] == 50_000 and december["credits"][0]["occurred_on"] == "2026-12-10"
    assert client.get("/api/income?month=2027-01").json()["credits_cents"] == 0
    assert client.get("/api/income?month=2026-10").json()["credits_cents"] == 40_000


def test_hierarchy_validation_and_linked_deletion(client):
    route = "/api/classifications"
    parent = client.post(route, json={"name": "Estudos"}).json()
    assert client.post(route, json={"name": " estudos "}).status_code == 409
    child = client.post(route, json={"name": "Cursos", "parent_id": parent["id"]}).json()
    leaf = client.post(route, json={"name": "Idiomas", "parent_id": child["id"]}).json()
    assert leaf["level"] == 3
    assert client.post(route, json={"name": "Nível indevido", "parent_id": leaf["id"]}).status_code == 422
    assert client.delete(f"{route}/{parent['id']}").status_code == 409
    assert client.put(f"{route}/{parent['id']}", json={"name": "Educação", "active": False}).status_code == 200
    items = {item["id"]: item for item in client.get(route).json()}
    assert items[parent["id"]]["name"] == "Educação"
    assert not items[child["id"]]["active"]
    assert not items[leaf["id"]]["active"]
    assert client.put(f"{route}/{leaf['id']}", json={"name": "Idiomas", "parent_id": child["id"]}).status_code == 422
    assert client.delete(f"{route}/{leaf['id']}").status_code == 204


def test_rejects_foreign_origins_and_hosts(client):
    settings = client.get("/api/settings").json()
    assert client.put("/api/settings", json=settings, headers={"Origin": "https://example.com"}).status_code == 403
    assert client.get("/api/settings", headers={"Host": "example.com"}).status_code == 400
    assert client.get("/api/settings").headers["Cache-Control"] == "no-store"
