from datetime import date

from fastapi import HTTPException

from .models import Expense, PurchaseInstallment
from .payment_methods import card_due_on
from .recurrence import last_day


def set_purchase_installments(expense: Expense, count: int | None) -> PurchaseInstallment | None:
    if count is None:
        if expense.installment_count is not None:
            expense.purchase_installments.clear()
        expense.installment_count = None
        return None

    if expense.kind != "avulsa" or expense.credit_kind is not None or expense.agreement_id is not None:
        raise HTTPException(422, "Use o número de parcelas em uma despesa comum avulsa.")
    if count > expense.amount_cents:
        raise HTTPException(422, "O valor total deve permitir pelo menos um centavo por parcela.")

    first = expense.occurred_on
    day = first.day
    if expense.payment_method.kind == "credito":
        day = expense.payment_due_day
        first = card_due_on(first, day)
        if first is None:
            raise HTTPException(422, "Informe uma data de compra com vencimento válido para o cartão escolhido.")

    start = first.year * 12 + first.month - 1
    if start + count - 1 > 9999 * 12 + 11:
        raise HTTPException(422, "O parcelamento ultrapassa as datas aceitas pelo sistema.")

    base, remainder = divmod(expense.amount_cents, count)
    previous = {item.number: item for item in expense.purchase_installments}
    schedule = []
    for number in range(1, count + 1):
        year, month = divmod(start + number - 1, 12)
        reference = date(year, month + 1, 1)
        item = previous.get(number) or PurchaseInstallment(number=number)
        item.due_on = reference.replace(day=min(day, last_day(reference).day))
        item.amount_cents = base + (1 if number <= remainder else 0)
        schedule.append(item)
    expense.installment_count = count
    expense.purchase_installments = schedule
    return schedule[0]
