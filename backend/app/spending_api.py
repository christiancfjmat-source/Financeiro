from collections import defaultdict
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Response
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import contains_eager, joinedload, selectinload

from .api import Db, MonthQuery, find, local_date, month_start, normalize_name, resolve_tags, save
from .installments import create_installments, installment_details
from .models import Classification, Expense, InstallmentAdvance, MonthlyBudget, Settings, Tag
from .payment_methods import card_due_on, resolve_payment
from .recurrence import expense_in_month, is_current_version, last_day, occurrence_date, projection_end
from .schemas import (AdvanceDetails, BudgetInput, BudgetProgress, CloseRecurrence, ExpenseInput,
                      ExpenseOutput, PaymentMethodOutput, TagInput, TagOutput)

router = APIRouter(prefix="/api")


def expense_horizon(db: Db, today: date):
    return projection_end(today, find(db, Settings, 1).projection_months)


def expense_ledger(query, reference: date, horizon: date):
    return query.outerjoin(InstallmentAdvance, Expense.id == InstallmentAdvance.expense_id).where(or_(
        and_(InstallmentAdvance.expense_id.is_(None), expense_in_month(reference, horizon)),
        InstallmentAdvance.paid_on.between(reference, last_day(reference)),
    ))


def expense_result(expense: Expense, reference: date, today: date):
    current = today.replace(day=1)
    fixed = expense.kind == "fixa"
    agreement = expense.agreement
    advance = expense.advance
    occurred_on = advance.paid_on if advance else occurrence_date(expense, reference)
    method = expense.payment_method
    editable = advance is None and (not fixed or (reference >= current and is_current_version(expense, current)))
    return ExpenseOutput(
        id=expense.id, kind="fixa" if agreement else expense.kind,
        credit_kind=agreement.kind if agreement else expense.credit_kind,
        credit_mode="individual" if agreement else "unica" if expense.credit_kind else None,
        occurred_on=occurred_on,
        payment_method=PaymentMethodOutput(id=method.id, name=method.name, kind=method.kind, due_day=method.due_day),
        payment_due_day=expense.payment_due_day,
        payment_due_on=card_due_on(occurred_on, expense.payment_due_day),
        starts_on=agreement.starts_on if agreement else expense.occurred_on if fixed else None,
        ends_on=agreement.ends_on if agreement else expense.ends_on, closed_on=expense.closed_on,
        installment=installment_details(expense) if agreement else None,
        advance=AdvanceDetails(paid_on=advance.paid_on, paid_cents=advance.paid_cents) if advance else None,
        description=expense.description, amount_cents=advance.paid_cents if advance else expense.amount_cents,
        department_id=expense.department_id, category_id=expense.category_id, subcategory_id=expense.subcategory_id,
        tags=[TagOutput(id=tag.id, name=tag.name) for tag in expense.tags],
        can_edit=editable,
        can_delete=editable and (not fixed or expense.occurred_on >= current),
        can_close=editable and fixed and expense.ends_on is None,
    )


@router.get("/tags", response_model=list[TagOutput])
def list_tags(db: Db):
    return list(db.scalars(select(Tag).order_by(Tag.name_key)))


@router.post("/tags", response_model=TagOutput, status_code=201)
def add_tag(data: TagInput, db: Db):
    tag = Tag(name=data.name, name_key=normalize_name(data.name))
    db.add(tag)
    save(db, "Já existe uma tag com esse nome.")
    return tag


@router.put("/tags/{tag_id}", response_model=TagOutput)
def edit_tag(tag_id: int, data: TagInput, db: Db):
    tag = find(db, Tag, tag_id)
    tag.name = data.name
    tag.name_key = normalize_name(data.name)
    save(db, "Já existe uma tag com esse nome.")
    return tag


@router.delete("/tags/{tag_id}", status_code=204)
def delete_tag(tag_id: int, db: Db):
    db.delete(find(db, Tag, tag_id))
    save(db, "Remova esta tag dos lançamentos vinculados antes de excluí-la.")
    return Response(status_code=204)


@router.get("/expenses", response_model=list[ExpenseOutput])
def list_expenses(db: Db, month: MonthQuery = None):
    today = local_date()
    reference = month_start(month) if month else today.replace(day=1)
    query = expense_ledger(select(Expense), reference, expense_horizon(db, today)).options(
        selectinload(Expense.tags), joinedload(Expense.agreement), joinedload(Expense.payment_method), contains_eager(Expense.advance),
    )
    results = (expense_result(expense, reference, today) for expense in db.scalars(query))
    return sorted(results, key=lambda item: (item.occurred_on, item.id), reverse=True)


def apply_expense(db: Db, expense: Expense, data: ExpenseInput, previous: Expense | None = None):
    selected = (data.department_id, data.category_id, data.subcategory_id)
    source = previous if previous is not None else expense
    existing = (source.department_id, source.category_id, source.subcategory_id)
    if existing != selected:
        department = find(db, Classification, data.department_id)
        category = find(db, Classification, data.category_id)
        if (department.level != 1 or category.level != 2 or category.parent_id != department.id
                or not department.active or not category.active):
            raise HTTPException(422, "Selecione uma categoria ativa do departamento informado.")
        if data.subcategory_id is not None:
            subcategory = find(db, Classification, data.subcategory_id)
            if subcategory.level != 3 or subcategory.parent_id != category.id or not subcategory.active:
                raise HTTPException(422, "Selecione uma subcategoria ativa da categoria informada.")
    tags = resolve_tags(db, data.tag_ids)
    method, due_day = resolve_payment(db, data, source)
    for key, value in data.model_dump(exclude={"tag_ids", "credit_mode", "payment_method_id"}).items():
        setattr(expense, key, value)
    expense.payment_method = method
    expense.payment_due_day = due_day
    expense.tags = tags


@router.post("/expenses", response_model=ExpenseOutput, status_code=201)
def add_expense(data: ExpenseInput, db: Db):
    today = local_date()
    expense = Expense()
    apply_expense(db, expense, data)
    reference = data.occurred_on.replace(day=1)
    if data.kind == "fixa":
        if data.occurred_on > expense_horizon(db, today):
            raise HTTPException(422, "Escolha um início dentro do horizonte de projeção.")
        expense.effective_from = reference
    if data.creates_installments:
        installments = create_installments(expense, data.credit_kind)
        db.add_all(installments)
        expense = installments[0]
    else:
        db.add(expense)
    save(db, "Não foi possível salvar a despesa. Confira a categoria e as tags.")
    return expense_result(expense, reference, today)


@router.put("/expenses/{expense_id}", response_model=ExpenseOutput)
def edit_expense(expense_id: int, data: ExpenseInput, db: Db):
    today = local_date()
    current = today.replace(day=1)
    expense = find(db, Expense, expense_id)
    reference = data.occurred_on.replace(day=1)
    if expense.advance is not None:
        raise HTTPException(409, "Esta parcela já foi antecipada. O pagamento e o vencimento original estão no histórico.")
    if data.creates_installments:
        raise HTTPException(422, "A criação de parcelas individuais é feita em Nova despesa.")
    if expense.agreement_id is not None:
        if (data.kind != "fixa" or data.ends_on is not None or data.credit_kind is not None
                or data.occurred_on != expense.occurred_on):
            raise HTTPException(422, "A edição da parcela mantém o vencimento e o prazo do contrato.")
        apply_expense(db, expense, data.model_copy(update={"kind": "avulsa"}))
        save(db, "Não foi possível salvar a parcela.")
        return expense_result(expense, reference, today)
    changed_start = expense.kind != "fixa" or data.occurred_on != expense.occurred_on
    if data.kind == "fixa" and changed_start and data.occurred_on > expense_horizon(db, today):
        raise HTTPException(422, "Escolha um início dentro do horizonte de projeção.")
    if expense.kind == "fixa":
        if not is_current_version(expense, current):
            raise HTTPException(409, "Esta despesa fixa pertence ao histórico ou já foi finalizada.")
        if data.kind != "fixa":
            raise HTTPException(422, "O tipo de uma despesa fixa é definido no cadastro.")
        if data.occurred_on != expense.occurred_on and min(data.occurred_on, expense.occurred_on) < current:
            raise HTTPException(422, "A data de início das competências anteriores é preservada.")
        if data.ends_on is not None and data.ends_on < current:
            raise HTTPException(422, "Selecione um término no mês atual ou em um mês futuro.")
        if expense.effective_from < current:
            payment_changed = data.payment_method_id is not None and data.payment_method_id != expense.payment_method_id
            changed = any(getattr(expense, field) != value for field, value
                          in data.model_dump(exclude={"tag_ids", "credit_mode", "payment_method_id"}).items())
            if not changed and not payment_changed and {tag.id for tag in expense.tags} == set(data.tag_ids):
                return expense_result(expense, current, today)
            version = Expense(effective_from=current)
            apply_expense(db, version, data, previous=expense)
            expense.effective_through = current - timedelta(days=1)
            db.add(version)
            expense = version
        else:
            apply_expense(db, expense, data)
            expense.effective_from = max(current, reference)
        reference = expense.effective_from
    else:
        apply_expense(db, expense, data)
        if data.kind == "fixa":
            expense.effective_from = reference
    save(db, "Não foi possível salvar a despesa. Confira a categoria e as tags.")
    return expense_result(expense, reference, today)


@router.post("/expenses/{expense_id}/close", status_code=204)
def close_expense(expense_id: int, data: CloseRecurrence, db: Db):
    expense = find(db, Expense, expense_id)
    current = local_date().replace(day=1)
    if expense.kind != "fixa" or expense.ends_on is not None or not is_current_version(expense, current):
        raise HTTPException(409, "Esta ação está disponível para uma despesa fixa ativa sem prazo.")
    if data.closed_on < max(current, expense.occurred_on):
        raise HTTPException(422, "Selecione uma data a partir do início e dentro do mês atual ou de um mês futuro.")
    expense.closed_on = data.closed_on
    save(db, "Não foi possível finalizar a despesa fixa.")
    return Response(status_code=204)


@router.delete("/expenses/{expense_id}", status_code=204)
def delete_expense(expense_id: int, db: Db):
    expense = find(db, Expense, expense_id)
    if expense.advance is not None:
        raise HTTPException(409, "Esta parcela já foi antecipada e está no histórico de pagamentos.")
    current = local_date().replace(day=1)
    if expense.kind == "fixa" and (expense.occurred_on < current or not is_current_version(expense, current)):
        raise HTTPException(409, "Este lançamento possui histórico. Use o término da despesa fixa para encerrar a recorrência.")
    db.delete(expense)
    save(db, "Não foi possível excluir a despesa.")
    return Response(status_code=204)


@router.put("/budgets/{category_id}", response_model=BudgetInput)
def set_budget(category_id: int, data: BudgetInput, db: Db, month: MonthQuery = None):
    category = find(db, Classification, category_id)
    if category.level != 2:
        raise HTTPException(422, "O teto mensal deve ser definido em uma categoria.")
    reference = month_start(month)
    budget = db.get(MonthlyBudget, (category_id, reference))
    if budget is None:
        budget = MonthlyBudget(category_id=category_id, month=reference)
        db.add(budget)
    budget.limit_cents = data.limit_cents
    save(db, "Não foi possível salvar o teto da categoria.")
    return budget


@router.delete("/budgets/{category_id}", status_code=204)
def delete_budget(category_id: int, db: Db, month: MonthQuery = None):
    budget = find(db, MonthlyBudget, (category_id, month_start(month)))
    db.delete(budget)
    save(db, "Não foi possível remover o teto da categoria.")
    return Response(status_code=204)


@router.get("/spending")
def read_spending(db: Db, month: MonthQuery = None):
    today = local_date()
    reference = month_start(month) if month else today.replace(day=1)
    categories: dict[int, int] = defaultdict(int)
    departments: dict[int, int] = defaultdict(int)
    count = 0
    amount = func.coalesce(InstallmentAdvance.paid_cents, Expense.amount_cents)
    grouped = expense_ledger(select(Expense.department_id, Expense.category_id, func.sum(amount), func.count()),
                             reference, expense_horizon(db, today)).group_by(Expense.department_id, Expense.category_id)
    for department, category, subtotal, quantity in db.execute(grouped):
        categories[category] += subtotal
        departments[department] += subtotal
        count += quantity

    configured = db.scalars(select(MonthlyBudget).where(MonthlyBudget.month == reference)
                            .order_by(MonthlyBudget.category_id))
    budgets = []
    for budget in configured:
        spent = categories.get(budget.category_id, 0)
        budgets.append(BudgetProgress(category_id=budget.category_id, limit_cents=budget.limit_cents,
                                      spent_cents=spent, available_cents=budget.limit_cents - spent))
    return {"month": reference.isoformat()[:7], "total_cents": sum(departments.values()),
            "expense_count": count, "by_category": dict(categories), "by_department": dict(departments),
            "budgets": budgets}
