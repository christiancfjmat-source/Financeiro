from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import and_, or_, select
from sqlalchemy.orm import selectinload

from .api import Db, MonthQuery, find, local_date, month_start, resolve_tags, salary_for_month, save
from .models import IncomeCredit, Settings
from .recurrence import fixed_in_month, is_current_version, projection_end, scheduled_date
from .schemas import CloseRecurrence, IncomeCreditInput, IncomeCreditOutput, MonthlyIncome, TagOutput

router = APIRouter(prefix="/api/income")


def credit_horizon(db: Db, today: date) -> date:
    return projection_end(today, find(db, Settings, 1).projection_months)


def credit_result(credit: IncomeCredit, reference: date | None, today: date) -> IncomeCreditOutput:
    current = today.replace(day=1)
    fixed = credit.kind == "fixo"
    editable = not fixed or (reference >= current and is_current_version(credit, current))
    occurrence = (scheduled_date(credit.occurred_on, reference, credit.closed_on or credit.ends_on)
                  if fixed else credit.occurred_on)
    return IncomeCreditOutput(
        id=credit.id, month=reference, description=credit.description, amount_cents=credit.amount_cents,
        kind=credit.kind, occurred_on=occurrence, starts_on=credit.occurred_on if fixed else None,
        ends_on=credit.ends_on, closed_on=credit.closed_on, can_edit=editable,
        can_delete=editable and (not fixed or credit.month >= current),
        can_close=editable and fixed and credit.ends_on is None,
        tags=[TagOutput(id=tag.id, name=tag.name) for tag in credit.tags],
    )


@router.get("", response_model=MonthlyIncome)
def read_income(db: Db, month: MonthQuery = None):
    today = local_date()
    reference = month_start(month) if month else today.replace(day=1)
    salary = salary_for_month(db, reference)
    credits = []
    unassigned = []
    query = select(IncomeCredit).where(or_(
        and_(IncomeCredit.kind == "avulso", or_(IncomeCredit.month == reference, IncomeCredit.month.is_(None))),
        and_(IncomeCredit.kind == "fixo", fixed_in_month(IncomeCredit, reference, credit_horizon(db, today))),
    )).options(selectinload(IncomeCredit.tags)).order_by(IncomeCredit.id)
    for credit in db.scalars(query):
        if credit.month is None:
            unassigned.append(credit_result(credit, None, today))
        else:
            credits.append(credit_result(credit, reference, today))
    credited = sum(credit.amount_cents for credit in credits)
    return {"month": reference.isoformat()[:7], "salary_cents": salary, "credits_cents": credited,
            "total_cents": salary + credited, "credits": credits, "unassigned": unassigned}


@router.post("/credits", response_model=IncomeCreditOutput, status_code=201)
def add_credit(data: IncomeCreditInput, db: Db):
    today = local_date()
    if data.kind == "fixo" and data.occurred_on > credit_horizon(db, today):
        raise HTTPException(422, "Escolha um início dentro do horizonte de projeção.")
    fields = credit_fields(data)
    credit = IncomeCredit(**fields, tags=resolve_tags(db, data.tag_ids))
    if credit.kind == "fixo":
        credit.effective_from = credit.month
    db.add(credit)
    save(db, "Não foi possível registrar o crédito.")
    return credit_result(credit, credit.month, today)


def credit_fields(data: IncomeCreditInput):
    fields = data.model_dump(exclude={"tag_ids"})
    fields["month"] = data.month or data.occurred_on.replace(day=1)
    return fields


@router.put("/credits/{credit_id}", response_model=IncomeCreditOutput)
def edit_credit(credit_id: int, data: IncomeCreditInput, db: Db):
    today = local_date()
    current = today.replace(day=1)
    credit = find(db, IncomeCredit, credit_id)
    changed_start = credit.kind != "fixo" or data.occurred_on != credit.occurred_on
    if data.kind == "fixo" and changed_start and data.occurred_on > credit_horizon(db, today):
        raise HTTPException(422, "Escolha um início dentro do horizonte de projeção.")
    if credit.kind == "fixo":
        if not is_current_version(credit, current):
            raise HTTPException(409, "Este crédito fixo pertence ao histórico ou já foi finalizado.")
        if data.kind != "fixo":
            raise HTTPException(422, "O tipo de um crédito fixo é definido no cadastro.")
        if changed_start and min(credit.occurred_on, data.occurred_on) < current:
            raise HTTPException(422, "A data de início das competências anteriores é preservada.")
        if data.ends_on and data.ends_on < current:
            raise HTTPException(422, "Selecione um término no mês atual ou em um mês futuro.")

    fields = credit_fields(data)
    tags = resolve_tags(db, data.tag_ids)
    reference = fields["month"]
    if credit.kind == "fixo" and credit.effective_from < current:
        if (all(getattr(credit, field) == value for field, value in fields.items())
                and {tag.id for tag in credit.tags} == {tag.id for tag in tags}):
            return credit_result(credit, current, today)
        credit.effective_through = current - timedelta(days=1)
        credit = IncomeCredit(**fields, tags=tags, effective_from=current)
        db.add(credit)
        reference = current
    else:
        originally_fixed = credit.kind == "fixo"
        for field, value in fields.items():
            setattr(credit, field, value)
        if data.kind == "fixo":
            credit.effective_from = max(current, reference) if originally_fixed else reference
            reference = credit.effective_from
        credit.tags = tags
    save(db, "Não foi possível atualizar o crédito.")
    return credit_result(credit, reference, today)


@router.post("/credits/{credit_id}/close", status_code=204)
def close_credit(credit_id: int, data: CloseRecurrence, db: Db):
    credit = find(db, IncomeCredit, credit_id)
    current = local_date().replace(day=1)
    if credit.kind != "fixo" or credit.ends_on is not None or not is_current_version(credit, current):
        raise HTTPException(409, "Esta ação está disponível para um crédito fixo ativo sem prazo.")
    if data.closed_on < max(current, credit.occurred_on):
        raise HTTPException(422, "Selecione uma data a partir do início e dentro do mês atual ou de um mês futuro.")
    credit.closed_on = data.closed_on
    save(db, "Não foi possível finalizar o crédito fixo.")
    return Response(status_code=204)


@router.delete("/credits/{credit_id}", status_code=204)
def delete_credit(credit_id: int, db: Db):
    credit = find(db, IncomeCredit, credit_id)
    current = local_date().replace(day=1)
    if credit.kind == "fixo" and (credit.month < current or not is_current_version(credit, current)):
        raise HTTPException(409, "Este crédito possui histórico. Use o término do crédito fixo para encerrar a recorrência.")
    db.delete(credit)
    save(db, "Não foi possível excluir o crédito.")
    return Response(status_code=204)
