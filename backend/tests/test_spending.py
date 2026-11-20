from pathlib import Path
from datetime import date

from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
import pytest

from backend.app.db import ROOT, engine_for
from backend.app.main import create_app
from backend.app import spending_api


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / "spending.sqlite3")) as connection:
        yield connection


def items(client):
    return {item["name"]: item for item in client.get("/api/classifications").json()}


def expense_payload(client, **overrides):
    catalog = items(client)
    return {"occurred_on": "2026-11-30", "description": "Compra semanal", "amount_cents": 32_599,
            "department_id": catalog["Alimentação"]["id"], "category_id": catalog["Supermercado"]["id"],
            **overrides}


def add_tag(client, name):
    result = client.post("/api/tags", json={"name": name})
    assert result.status_code == 201, result.text
    return result.json()


def test_budget_sums_subcategories_once_and_recalculates_on_edit_or_delete(client):
    payload = expense_payload(client)
    category = payload["category_id"]
    department = payload["department_id"]
    sub = client.post("/api/classifications", json={"name": "Hortifruti", "parent_id": category}).json()
    tags = [add_tag(client, "Casa"), add_tag(client, "Semanal")]
    assert client.put(f"/api/budgets/{category}?month=2026-11", json={"limit_cents": 85_000}).status_code == 200
    assert client.put(f"/api/budgets/{category}?month=2026-12", json={"limit_cents": 90_000}).status_code == 200
    first = client.post("/api/expenses", json=payload)
    assert first.status_code == 201, first.text
    second = client.post("/api/expenses", json={**payload, "subcategory_id": sub["id"], "amount_cents": 60_001,
                                               "tag_ids": [tag["id"] for tag in tags]})
    assert second.status_code == 201, second.text
    assert second.json()["tags"] == tags
    report = client.get("/api/spending?month=2026-11").json()
    assert report["expense_count"] == 2
    assert report["total_cents"] == 92_600
    assert report["by_department"] == {str(department): 92_600}
    assert report["by_category"] == {str(category): 92_600}
    assert report["budgets"] == [{"category_id": category, "limit_cents": 85_000,
                                  "spent_cents": 92_600, "available_cents": -7_600}]

    first_path = f"/api/expenses/{first.json()['id']}"
    assert client.put(first_path, json={**payload, "occurred_on": "2026-12-01"}).status_code == 200
    assert client.get("/api/spending?month=2026-12").json()["budgets"][0]["available_cents"] == 57_401
    assert client.get("/api/spending?month=2026-11").json()["budgets"][0]["available_cents"] == 24_999
    assert client.delete(f"/api/expenses/{second.json()['id']}").status_code == 204
    assert client.get("/api/expenses?month=2026-11").json() == []
    assert client.get("/api/spending?month=2026-11").json()["budgets"][0]["available_cents"] == 85_000


def test_validation_and_linked_tags(client):
    payload = expense_payload(client)
    for key in ("amount_cents", "occurred_on", "category_id"):
        assert client.post("/api/expenses", json={k: v for k, v in payload.items() if k != key}).status_code == 422
    root = items(client)["Moradia"]["id"]
    for changes in ({"occurred_on": "2026-02-29"}, {"amount_cents": 0}, {"amount_cents": 23.34},
                    {"department_id": root}, {"category_id": root}, {"subcategory_id": root}, {"tag_ids": [99999]}):
        assert client.post("/api/expenses", json={**payload, **changes}).status_code == 422
    assert client.put(f"/api/budgets/{root}", json={"limit_cents": 50_000}).status_code == 422
    tag = add_tag(client, "Viagem")
    assert client.post("/api/tags", json={"name": " VIAGEM "}).status_code == 409
    expense = client.post("/api/expenses", json={**payload, "tag_ids": [tag["id"], tag["id"]]})
    assert expense.status_code == 201
    assert expense.json()["tags"] == [tag]
    path = f"/api/tags/{tag['id']}"
    assert client.delete(path).status_code == 409
    assert client.put(path, json={"name": "Viagem pessoal"}).status_code == 200
    assert client.get("/api/expenses?month=2026-11").json()[0]["tags"][0]["name"] == "Viagem pessoal"
    assert client.delete(f"/api/classifications/{payload['category_id']}").status_code == 409
    assert client.put(f"/api/expenses/{expense.json()['id']}", json=payload).status_code == 200
    assert client.delete(path).status_code == 204


def test_existing_expense_keeps_department_after_category_moves(client):
    payload = expense_payload(client)
    expense = client.post("/api/expenses", json=payload).json()
    catalog = items(client)
    new_parent = catalog["Compras"]["id"]
    category_path = f"/api/classifications/{payload['category_id']}"
    assert client.put(category_path, json={"name": "Supermercado", "parent_id": new_parent}).status_code == 200
    assert client.put(f"/api/expenses/{expense['id']}", json={**payload, "description": "Descrição corrigida"}).status_code == 200
    assert client.post("/api/expenses", json={**payload, "department_id": new_parent}).status_code == 201
    report = client.get("/api/spending?month=2026-11").json()
    assert report["by_department"] == {str(payload["department_id"]): 32_599, str(new_parent): 32_599}
    assert report["by_category"] == {str(payload["category_id"]): 65_198}


def test_v2_database_upgrades_existing_expenses_and_tags(tmp_path: Path):
    path = tmp_path / "upgrade.sqlite3"
    engine = engine_for(path)
    config = Config()
    config.set_main_option("script_location", str(ROOT / "backend" / "migrations").replace("%", "%%"))
    try:
        with engine.begin() as connection:
            connection.exec_driver_sql("BEGIN IMMEDIATE")
            config.attributes["connection"] = connection
            command.upgrade(config, "0002")
            connection.exec_driver_sql("UPDATE settings SET name = 'Minha Casa'")
            connection.exec_driver_sql("INSERT INTO tags (id, name, name_key) VALUES (1, 'Antiga', 'antiga')")
            connection.exec_driver_sql(
                "INSERT INTO expenses (id, occurred_on, description, amount_cents, department_id, category_id) "
                "SELECT 1, '2026-10-04', 'Anterior', 1250, parent_id, id FROM classifications WHERE name = 'Supermercado'"
            )
            connection.exec_driver_sql("INSERT INTO expense_tags (expense_id, tag_id) VALUES (1, 1)")
    finally:
        engine.dispose()

    with TestClient(create_app(path)) as client:
        assert client.get("/api/settings").json()["name"] == "Minha Casa"
        assert client.get("/api/settings").json()["projection_months"] == 36
        assert len(client.get("/api/classifications").json()) == 56
        migrated = client.get("/api/expenses?month=2026-10").json()[0]
        assert migrated["kind"] == "avulsa"
        assert migrated["amount_cents"] == 1250
        assert migrated["payment_method"]["kind"] == "nao_informado"
        assert migrated["tags"][0]["name"] == "Antiga"
        tag = add_tag(client, "Reposição")
        payload = expense_payload(client, tag_ids=[tag["id"]])
        budget_path = f"/api/budgets/{payload['category_id']}?month=2026-11"
        assert client.post("/api/expenses", json=payload).status_code == 201
        assert client.put(budget_path, json={"limit_cents": 0}).status_code == 200

    with TestClient(create_app(path)) as restarted:
        assert restarted.get("/api/expenses?month=2026-11").json()[0]["tags"] == [tag]
        assert restarted.get("/api/spending?month=2026-11").json()["budgets"][0]["available_cents"] == -32_599
        assert restarted.delete(budget_path).status_code == 204
        assert restarted.get("/api/spending?month=2026-11").json()["total_cents"] == 32_599


def test_payment_methods_and_card_dates_preserve_purchase_month(client):
    path = "/api/payment-methods"
    defaults = {method["kind"]: method for method in client.get(path).json()}
    assert {"credito", "debito", "pix", "boleto", "debito_automatico"}.issubset(defaults)
    assert defaults["credito"]["due_day"] is None
    card = {"name": "Cartão da casa", "kind": "credito", "due_day": 10}
    assert client.post(path, json={**card, "due_day": None}).status_code == 422
    assert client.post(path, json={**card, "due_day": 32}).status_code == 422
    assert client.post(path, json={**card, "kind": "pix"}).status_code == 422
    method = client.post(path, json=card)
    assert method.status_code == 201, method.text
    second = client.post(path, json={**card, "name": "Segundo cartão", "due_day": 31})
    assert second.status_code == 201, second.text
    assert client.post(path, json={**card, "name": " CARTÃO DA CASA "}).status_code == 409

    payload = expense_payload(client, occurred_on="2026-11-20", payment_method_id=defaults["credito"]["id"])
    assert client.post("/api/expenses", json=payload).status_code == 422
    payload["payment_method_id"] = method.json()["id"]
    saved = client.post("/api/expenses", json=payload)
    assert saved.status_code == 201, saved.text
    expense = saved.json()
    assert expense["payment_method"]["name"] == "Cartão da casa"
    assert expense["payment_due_on"] == "2026-12-10" and expense["payment_due_day"] == 10
    assert client.get("/api/spending?month=2026-11").json()["total_cents"] == payload["amount_cents"]
    assert client.get("/api/spending?month=2026-12").json()["total_cents"] == 0

    method_path = f"{path}/{method.json()['id']}"
    assert client.put(method_path, json={**card, "due_day": 11}).status_code == 200
    assert client.delete(method_path).status_code == 409
    assert client.put(method_path, json={**card, "kind": "pix", "due_day": None}).status_code == 409
    recorded = client.get("/api/expenses?month=2026-11").json()[0]
    assert recorded["payment_due_on"] == "2026-12-10"
    edited = client.put(f"/api/expenses/{expense['id']}", json={**payload, "description": "Compra revisada"})
    assert edited.status_code == 200 and edited.json()["payment_due_on"] == "2026-12-10"
    february = client.post("/api/expenses", json={**payload, "occurred_on": "2028-02-27",
                                                   "payment_method_id": second.json()["id"]})
    assert february.status_code == 201 and february.json()["payment_due_on"] == "2028-02-29"


def test_fixed_expense_payment_changes_preserve_earlier_months(client, monkeypatch):
    monkeypatch.setattr(spending_api, "local_date", lambda: date(2026, 11, 20))
    card = client.post("/api/payment-methods", json={"name": "Cartão", "kind": "credito", "due_day": 6}).json()
    pix = next(method for method in client.get("/api/payment-methods").json() if method["kind"] == "pix")
    payload = expense_payload(client, kind="fixa", occurred_on="2026-09-20", payment_method_id=card["id"])
    saved = client.post("/api/expenses", json=payload)
    assert saved.status_code == 201, saved.text
    revised = client.put(f"/api/expenses/{saved.json()['id']}", json={**payload, "payment_method_id": pix["id"]})
    assert revised.status_code == 200, revised.text
    past, = client.get("/api/expenses?month=2026-10").json()
    current, = client.get("/api/expenses?month=2026-11").json()
    assert past["payment_method"]["id"] == card["id"] and past["payment_due_on"] == "2026-11-06"
    assert current["payment_method"]["id"] == pix["id"] and current["payment_due_on"] is None


def test_fixed_term_includes_start_and_end_months_without_double_counting(client, monkeypatch):
    monkeypatch.setattr(spending_api, "local_date", lambda: date(2026, 1, 10))
    data = expense_payload(client, kind="fixa", occurred_on="2026-01-31", ends_on="2026-03-08")
    invalid = client.post("/api/expenses", json={**data, "ends_on": "2026-01-30"})
    assert invalid.status_code == 422
    result = client.post("/api/expenses", json=data)
    assert result.status_code == 201, result.text
    assert result.json()["can_close"] is False
    category = data["category_id"]
    assert client.put(f"/api/budgets/{category}?month=2026-02", json={"limit_cents": 50_000}).status_code == 200
    assert client.post("/api/expenses", json={**data, "kind": "avulsa", "ends_on": None,
                                             "occurred_on": "2026-02-20", "amount_cents": 5_501}).status_code == 201
    february = client.get("/api/expenses?month=2026-02").json()
    assert [(item["occurred_on"], item["kind"]) for item in february] == [
        ("2026-02-28", "fixa"), ("2026-02-20", "avulsa")]
    report = client.get("/api/spending?month=2026-02").json()
    assert report["expense_count"] == 2
    assert report["total_cents"] == 38_100
    assert report["budgets"][0]["available_cents"] == 11_900
    assert client.get("/api/expenses?month=2026-03").json()[0]["occurred_on"] == "2026-03-08"
    assert client.get("/api/expenses?month=2026-04").json() == []


def test_fixed_expenses_respect_rolling_horizon_through_exact_date(client, monkeypatch):
    monkeypatch.setattr(spending_api, "local_date", lambda: date(2026, 1, 20))
    early = expense_payload(client, kind="fixa", occurred_on="2025-11-15")
    late = {**early, "occurred_on": "2025-11-30"}
    for data in (early, late):
        assert client.post("/api/expenses", json=data).status_code == 201
    assert client.post("/api/expenses", json={**early, "occurred_on": "2029-01-21"}).status_code == 422
    assert client.get("/api/spending?month=2025-12").json()["expense_count"] == 2
    assert client.get("/api/spending?month=2028-12").json()["expense_count"] == 2
    assert client.get("/api/spending?month=2029-01").json()["expense_count"] == 1
    assert client.get("/api/spending?month=2029-02").json()["expense_count"] == 0
    assert client.get("/api/expenses?month=2029-01").json()[0]["occurred_on"] == "2029-01-15"
    assert client.get("/api/expenses?month=2029-02").json() == []


def test_change_and_close_keep_past_expense_amounts(client, monkeypatch):
    monkeypatch.setattr(spending_api, "local_date", lambda: date(2026, 11, 20))
    original = expense_payload(client, kind="fixa", occurred_on="2026-08-31", amount_cents=390_000)
    expense = client.post("/api/expenses", json=original).json()
    old_path = f"/api/expenses/{expense['id']}"
    assert client.delete(old_path).status_code == 409
    previous = client.get("/api/expenses?month=2026-10").json()[0]
    assert previous["can_edit"] is False
    assert previous["can_delete"] is False
    assert previous["can_close"] is False
    updated = client.put(old_path, json={**original, "amount_cents": 420_000})
    assert updated.status_code == 200, updated.text
    new_path = f"/api/expenses/{updated.json()['id']}"
    assert new_path != old_path
    assert client.put(old_path, json=original).status_code == 409
    assert client.get("/api/spending?month=2026-10").json()["total_cents"] == 390_000
    assert client.get("/api/spending?month=2026-11").json()["total_cents"] == 420_000
    assert client.get("/api/spending?month=2027-01").json()["total_cents"] == 420_000
    assert client.post(new_path + "/close", json={"closed_on": "2026-10-31"}).status_code == 422
    assert client.post(new_path + "/close", json={"closed_on": "2026-12-10"}).status_code == 204
    assert client.get("/api/expenses?month=2026-12").json()[0]["occurred_on"] == "2026-12-10"
    assert client.get("/api/spending?month=2026-12").json()["total_cents"] == 420_000
    assert client.get("/api/spending?month=2027-01").json()["total_cents"] == 0
    assert client.get("/api/spending?month=2026-10").json()["total_cents"] == 390_000
