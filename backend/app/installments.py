from datetime import date

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from .api import Db, local_date, save
from .models import CreditAgreement, Expense, InstallmentAdvance
from .recurrence import last_day, scheduled_date
from .schemas import AdvanceOption, AdvanceRequest, CreditKind, InstallmentDetails

router = APIRouter(prefix="/api/installment-advances")


def create_installments(template: Expense, kind: CreditKind) -> list[Expense]:
    start = template.occurred_on
    end = template.ends_on
    first_month = start.year * 12 + start.month - 1
    last_month = end.year * 12 + end.month - 1
    agreement = CreditAgreement(kind=kind, description=template.description, starts_on=start, ends_on=end,
                                installment_count=last_month - first_month + 1)
    expenses = []
    for number, period in enumerate(range(first_month, last_month + 1), start=1):
        year, month = divmod(period, 12)
        expenses.append(Expense(
            agreement=agreement, installment_number=number, kind="avulsa",
            occurred_on=scheduled_date(start, date(year, month + 1, 1), end),
            amount_cents=template.amount_cents, description=template.description,
            department_id=template.department_id, category_id=template.category_id,
            subcategory_id=template.subcategory_id, tags=list(template.tags),
        ))
    return expenses


def installment_details(expense: Expense) -> InstallmentDetails:
    agreement = expense.agreement
    return InstallmentDetails(agreement_id=agreement.id, agreement_description=agreement.description,
                              kind=agreement.kind, number=expense.installment_number,
                              total=agreement.installment_count, scheduled_on=expense.occurred_on,
                              scheduled_cents=expense.amount_cents)


def payment_date(value: date | None) -> date:
    today = local_date()
    if value and value > today:
        raise HTTPException(422, "Informe uma data de pagamento até hoje.")
    return value or today


def available_installments(paid_on: date):
    return (select(Expense).outerjoin(InstallmentAdvance)
            .where(Expense.agreement_id.is_not(None), Expense.occurred_on > last_day(paid_on),
                   InstallmentAdvance.expense_id.is_(None)))


@router.get("/options", response_model=list[AdvanceOption])
def advance_options(db: Db, paid_on: date | None = None):
    query = (available_installments(payment_date(paid_on)).options(joinedload(Expense.agreement))
             .order_by(Expense.agreement_id, Expense.installment_number))
    return [AdvanceOption(expense_id=expense.id, category_id=expense.category_id,
                          installment=installment_details(expense)) for expense in db.scalars(query)]


@router.post("", status_code=204)
def record_advances(data: AdvanceRequest, db: Db):
    paid_on = payment_date(data.paid_on)
    ids = [line.expense_id for line in data.installments]
    available = db.scalars(available_installments(paid_on).with_only_columns(Expense.id)
                           .where(Expense.id.in_(ids))).all()
    if len(available) != len(ids):
        raise HTTPException(409, "Uma das parcelas já foi antecipada ou não vence depois do mês do pagamento.")
    db.add_all(InstallmentAdvance(expense_id=line.expense_id, paid_on=paid_on, paid_cents=line.paid_cents)
               for line in data.installments)
    save(db, "Não foi possível registrar as antecipações. Atualize a lista de parcelas.")
    return Response(status_code=204)
