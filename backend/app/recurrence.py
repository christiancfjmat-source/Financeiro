from calendar import monthrange
from datetime import date

from sqlalchemy import and_, extract, false, or_

from .models import Expense, IncomeCredit


def last_day(month: date) -> date:
    return month.replace(day=monthrange(month.year, month.month)[1])


def projection_end(today: date, months: int) -> date:
    year, month = divmod(today.year * 12 + today.month - 1 + months, 12)
    month += 1
    return date(year, month, min(today.day, monthrange(year, month)[1]))


def expense_in_month(month: date, horizon: date):
    one_off = and_(Expense.kind == "avulsa", Expense.occurred_on.between(month, last_day(month)),
                   or_(Expense.agreement_id.is_(None), Expense.occurred_on <= horizon))
    return or_(one_off, and_(Expense.kind == "fixa", fixed_in_month(Expense, month, horizon)))


def fixed_in_month(period: type[Expense] | type[IncomeCredit], month: date, horizon: date):
    if month > horizon:
        return false()
    fixed = and_(
        period.effective_from <= month,
        or_(period.effective_through.is_(None), period.effective_through >= month),
        or_(period.ends_on.is_(None), period.ends_on >= month),
        or_(period.closed_on.is_(None), period.closed_on >= month),
    )
    if horizon < last_day(month):
        fixed = and_(fixed, or_(extract("day", period.occurred_on) <= horizon.day,
                                period.ends_on <= horizon, period.closed_on <= horizon))
    return fixed


def occurrence_date(expense: Expense, month: date) -> date:
    if expense.kind == "avulsa":
        return expense.occurred_on
    return scheduled_date(expense.occurred_on, month, expense.closed_on or expense.ends_on)


def scheduled_date(start: date, month: date, end: date | None) -> date:
    day = month.replace(day=min(start.day, last_day(month).day))
    return min(day, end) if end else day


def is_current_version(period: Expense | IncomeCredit, month: date) -> bool:
    return (period.effective_through is None and period.closed_on is None
            and (period.ends_on is None or period.ends_on >= month))
