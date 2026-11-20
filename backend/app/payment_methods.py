from datetime import date

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select

from .api import Db, find, normalize_name, save
from .models import Expense, PaymentMethod
from .recurrence import last_day
from .schemas import ExpenseInput, PaymentMethodInput, PaymentMethodOutput

router = APIRouter(prefix="/api/payment-methods")
SYSTEM_METHODS = ("nao_informado", "financiamento")


def public_method(db: Db, method_id: int) -> PaymentMethod:
    method = find(db, PaymentMethod, method_id)
    if method.kind in SYSTEM_METHODS:
        raise HTTPException(404, "Forma de pagamento não encontrada.")
    return method


@router.get("", response_model=list[PaymentMethodOutput])
def list_methods(db: Db):
    return list(db.scalars(select(PaymentMethod).where(PaymentMethod.kind.not_in(SYSTEM_METHODS))
                           .order_by(PaymentMethod.name_key, PaymentMethod.id)))


@router.post("", response_model=PaymentMethodOutput, status_code=201)
def add_method(data: PaymentMethodInput, db: Db):
    method = PaymentMethod(**data.model_dump(), name_key=normalize_name(data.name))
    db.add(method)
    save(db, "Já existe uma forma de pagamento com esse nome na categoria.")
    return method


@router.put("/{method_id}", response_model=PaymentMethodOutput)
def edit_method(method_id: int, data: PaymentMethodInput, db: Db):
    method = public_method(db, method_id)
    if method.kind != data.kind and db.scalar(select(Expense.id).where(Expense.payment_method_id == method.id).limit(1)):
        raise HTTPException(409, "Esta forma de pagamento já está em uso. Cadastre outra para mudar de categoria.")
    for field, value in data.model_dump().items():
        setattr(method, field, value)
    method.name_key = normalize_name(data.name)
    save(db, "Já existe uma forma de pagamento com esse nome na categoria.")
    return method


@router.delete("/{method_id}", status_code=204)
def delete_method(method_id: int, db: Db):
    db.delete(public_method(db, method_id))
    save(db, "Esta forma de pagamento está vinculada a despesas. Atualize os lançamentos antes de excluí-la.")
    return Response(status_code=204)


def resolve_payment(db: Db, data: ExpenseInput, source: Expense) -> tuple[PaymentMethod, int | None]:
    if data.credit_kind is not None or source.agreement_id is not None:
        if data.payment_method_id is not None:
            raise HTTPException(422, "Financiamentos e empréstimos recebem sua forma de pagamento automaticamente.")
        return db.scalar(select(PaymentMethod).where(PaymentMethod.kind == "financiamento")), None
    if data.payment_method_id is not None:
        method = public_method(db, data.payment_method_id)
        if method.id == source.payment_method_id:
            return method, source.payment_due_day
        if method.kind == "credito" and method.due_day is None:
            raise HTTPException(422, "Configure o dia de vencimento deste cartão em Formas de pagamento.")
        return method, method.due_day
    if source.payment_method_id is not None and source.payment_method.kind != "financiamento":
        return source.payment_method, source.payment_due_day
    # Older integrations can omit the field. The dashboard requires a choice for common expenses.
    return db.scalar(select(PaymentMethod).where(PaymentMethod.kind == "nao_informado")), None


def card_due_on(purchase: date, day: int | None) -> date | None:
    if day is None:
        return None
    candidate = purchase.replace(day=min(day, last_day(purchase).day))
    if candidate >= purchase:
        return candidate
    if purchase.year == 9999 and purchase.month == 12:
        return None
    next_month = date(purchase.year + (purchase.month == 12), purchase.month % 12 + 1, 1)
    return next_month.replace(day=min(day, last_day(next_month).day))
