from datetime import date

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select

from backend.app import installments, spending_api
from backend.app.main import create_app
from backend.app.models import CreditAgreement, Expense


@pytest.fixture
def client(tmp_path, monkeypatch):
    for module in (installments, spending_api):
        monkeypatch.setattr(module, "local_date", lambda: date(2026, 11, 20))
    with TestClient(create_app(tmp_path / "credit.sqlite3")) as connection:
        yield connection


def financing(client, **overrides):
    classes = {item["name"]: item["id"] for item in client.get("/api/classifications").json()}
    return {"kind": "fixa", "credit_kind": "financiamento", "occurred_on": "2027-01-31",
            "ends_on": "2027-12-10", "amount_cents": 125_099, "description": "Crédito veículo",
            "department_id": classes["Transporte"], "category_id": classes["Financiamento do veículo"],
            **overrides}


def expense_for(client, month):
    response = client.get("/api/expenses", params={"month": month})
    assert response.status_code == 200, response.text
    return response.json()


def report(client, month):
    return client.get("/api/spending", params={"month": month}).json()


def anticipate(client, paid_on, *payments):
    return client.post("/api/installment-advances", json={"paid_on": paid_on, "installments": [
        {"expense_id": expense_id, "paid_cents": paid_cents} for expense_id, paid_cents in payments
    ]})


def test_contract_creates_independent_monthly_expenses(client):
    tag_id = client.post("/api/tags", json={"name": "Veículo"}).json()["id"]
    settings = financing(client, tag_ids=[tag_id])
    result = client.post("/api/expenses", json=settings)
    assert result.status_code == 201, result.text
    assert result.json()["installment"]["total"] == 12
    assert result.json()["payment_method"]["kind"] == "financiamento"

    expenses = [expense_for(client, f"2027-{month:02d}")[0] for month in range(1, 13)]
    assert len({item["id"] for item in expenses}) == 12
    assert [item["installment"]["number"] for item in expenses] == list(range(1, 13))
    assert all(item["kind"] == "fixa" and item["tags"][0]["id"] == tag_id for item in expenses)
    assert {item["installment"]["agreement_id"] for item in expenses} == {
        result.json()["installment"]["agreement_id"]}
    assert expenses[1]["occurred_on"] == "2027-02-28"
    assert expenses[-1]["occurred_on"] == "2027-12-10"
    assert expense_for(client, "2026-12") == []
    assert expense_for(client, "2028-01") == []

    with client.app.state.engine.connect() as connection:
        assert connection.scalar(select(func.count(Expense.id))) == 12
        assert connection.scalar(select(func.count(CreditAgreement.id))) == 1

    march = expenses[2]
    changes = {**settings, "credit_kind": None, "ends_on": None,
               "occurred_on": march["occurred_on"], "amount_cents": 126_599}
    assert client.put(f"/api/expenses/{march['id']}", json=changes).status_code == 200
    assert expense_for(client, "2027-03")[0]["amount_cents"] == 126_599
    assert expense_for(client, "2027-04")[0]["amount_cents"] == 125_099


def test_advance_moves_payment_with_original_classification_and_value_history(client):
    data = financing(client, credit_kind="emprestimo", occurred_on="2026-11-15", ends_on="2027-02-18")
    assert client.post("/api/expenses", json=data).status_code == 201
    january = expense_for(client, "2027-01")[0]
    february = expense_for(client, "2027-02")[0]
    category = data["category_id"]
    november_budget = f"/api/budgets/{category}?month=2026-11"
    january_budget = f"/api/budgets/{category}?month=2027-01"
    for path in (november_budget, january_budget):
        assert client.put(path, json={"limit_cents": 300_000}).status_code == 200

    result = anticipate(client, "2026-11-19", (january["id"], 108_000), (february["id"], 101_150))
    assert result.status_code == 204, result.text
    november = expense_for(client, "2026-11")
    payments = [item for item in november if item["advance"]]
    assert len(payments) == 2
    assert {item["id"] for item in payments} == {january["id"], february["id"]}
    assert {item["occurred_on"] for item in payments} == {"2026-11-19"}
    assert all(item["amount_cents"] == item["advance"]["paid_cents"] and item["category_id"] == category
               and item["department_id"] == data["department_id"] for item in payments)
    assert {item["installment"]["scheduled_on"] for item in payments} == {"2027-01-15", "2027-02-15"}
    assert {item["installment"]["scheduled_cents"] for item in payments} == {125_099}
    assert {item["installment"]["kind"] for item in payments} == {"emprestimo"}
    assert expense_for(client, "2027-01") == expense_for(client, "2027-02") == []
    assert expense_for(client, "2026-12")[0]["advance"] is None
    current = report(client, "2026-11")
    assert current["expense_count"] == 3
    assert current["total_cents"] == 334_249
    assert current["by_department"] == {str(data["department_id"]): 334_249}
    assert current["budgets"][0]["available_cents"] == -34_249
    assert report(client, "2027-01")["budgets"][0]["spent_cents"] == 0
    path = f"/api/expenses/{january['id']}"
    assert not next(item for item in payments if item["id"] == january["id"])["can_edit"]
    assert client.delete(path).status_code == 409
    assert client.put(path, json={**data, "credit_kind": None, "ends_on": None,
                                  "occurred_on": january["occurred_on"]}).status_code == 409
    options = client.get("/api/installment-advances/options").json()
    assert [item["installment"]["number"] for item in options] == [2]


def test_only_eligible_installments_can_be_advanced_and_batch_is_atomic(client):
    data = financing(client, occurred_on="2026-11-25", ends_on="2027-01-25")
    assert client.post("/api/expenses", json={**data, "ends_on": None}).status_code == 422
    assert client.post("/api/expenses", json={**data, "kind": "avulsa", "ends_on": None}).status_code == 422
    assert client.post("/api/expenses", json=data).status_code == 201
    nov = expense_for(client, "2026-11")[0]["id"]
    dec = expense_for(client, "2026-12")[0]["id"]
    jan = expense_for(client, "2027-01")[0]["id"]
    assert anticipate(client, "2026-11-21", (dec, 100_000)).status_code == 422
    assert anticipate(client, "2026-11-20", (dec, 0)).status_code == 422
    assert anticipate(client, "2026-11-20", (dec, 90_000), (dec, 90_000)).status_code == 422
    assert anticipate(client, "2026-11-20", (dec, 90_000), (nov, 90_000)).status_code == 409
    assert expense_for(client, "2026-12")[0]["advance"] is None
    assert anticipate(client, "2026-11-20", (dec, 90_000)).status_code == 204
    assert anticipate(client, "2026-11-20", (jan, 90_000), (dec, 90_000)).status_code == 409
    assert expense_for(client, "2027-01")[0]["advance"] is None
    assert report(client, "2026-11")["total_cents"] == 215_099


def test_payments_outside_the_projection_can_still_be_advanced(client):
    data = financing(client, occurred_on="2029-10-31", ends_on="2030-02-28")
    assert client.post("/api/expenses", json=data).status_code == 201
    assert expense_for(client, "2029-10")[0]["installment"]["total"] == 5
    assert expense_for(client, "2029-11") == expense_for(client, "2030-02") == []
    options = client.get("/api/installment-advances/options").json()
    assert len(options) == 5
    assert anticipate(client, "2026-11-20", (options[-1]["expense_id"], 99_900)).status_code == 204
    assert report(client, "2026-11")["total_cents"] == 99_900


def test_credit_classification_and_record_mode_are_independent_of_category(client):
    classifications = client.get("/api/classifications").json()
    department = next(item["id"] for item in classifications if item["name"] == "Saúde")
    category = client.post("/api/classifications", json={"name": "Tratamentos", "parent_id": department}).json()
    data = financing(client, department_id=department, category_id=category["id"],
                     occurred_on="2027-01-10", ends_on="2027-03-10")
    assert client.post("/api/expenses", json={**data, "credit_kind": None, "credit_mode": "unica"}).status_code == 422
    one_off = client.post("/api/expenses", json={
        **data, "credit_mode": "unica", "kind": "avulsa", "ends_on": None,
    })
    assert one_off.status_code == 201, one_off.text
    assert expense_for(client, "2027-02") == []
    assert one_off.json()["credit_kind"] == "financiamento"

    recurring = client.post("/api/expenses", json={**data, "credit_mode": "unica"})
    assert recurring.status_code == 201, recurring.text
    february = expense_for(client, "2027-02")
    assert february[0]["id"] == recurring.json()["id"]
    assert february[0]["credit_mode"] == "unica" and february[0]["installment"] is None
    assert client.get("/api/installment-advances/options").json() == []

    assert client.post("/api/expenses", json={**data, "credit_mode": "individual"}).status_code == 201
    options = client.get("/api/installment-advances/options").json()
    assert len(options) == 3
    assert all(item["category_id"] == category["id"] for item in options)
    common = client.post("/api/expenses", json={**data, "credit_kind": None})
    assert common.status_code == 201
    assert common.json()["credit_kind"] is None and common.json()["credit_mode"] is None
