"""Carry monthly category limits forward and preserve closed periods."""

from datetime import datetime
from itertools import groupby, pairwise
from zoneinfo import ZoneInfo

from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    revisions = op.create_table(
        "budget_revisions",
        sa.Column("category_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("effective_month", sa.Date, primary_key=True),
        sa.Column("limit_cents", sa.BigInteger),
        sa.CheckConstraint("limit_cents >= 0", name="budget_revision_nonnegative"),
    )
    old = sa.table("monthly_budgets", sa.column("category_id", sa.Integer), sa.column("month", sa.Date),
                   sa.column("limit_cents", sa.BigInteger))
    connection = op.get_bind()
    current = datetime.now(ZoneInfo("America/Sao_Paulo")).date().replace(day=1)
    rows = connection.execute(sa.select(old).order_by(old.c.category_id, old.c.month)).all()
    converted = []
    for category_id, entries in groupby(rows, key=lambda row: row.category_id):
        history = []
        active_limit = None
        for entry in entries:
            if entry.month >= current:
                # Prefer the current month's limit, then the earliest planned one.
                active_limit = entry.limit_cents
                break
            history.append(entry)

        for entry, following in pairwise([*history, None]):
            month = entry.month
            converted.append(dict(category_id=category_id, effective_month=month, limit_cents=entry.limit_cents))
            next_month = month.replace(year=month.year + (month.month == 12), month=month.month % 12 + 1)
            if next_month < current and (following is None or following.month != next_month):
                converted.append(dict(category_id=category_id, effective_month=next_month, limit_cents=None))

        if active_limit is not None or history:
            converted.append(dict(category_id=category_id, effective_month=current, limit_cents=active_limit))

    if converted:
        connection.execute(revisions.insert(), converted)
    op.drop_table("monthly_budgets")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM budget_revisions")):
        raise RuntimeError("O banco tem tetos versionados. Use um backup anterior para retornar.")
    op.drop_table("budget_revisions")
    op.create_table(
        "monthly_budgets",
        sa.Column("category_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("month", sa.Date, primary_key=True),
        sa.Column("limit_cents", sa.BigInteger, nullable=False),
        sa.CheckConstraint("limit_cents >= 0", name="budget_nonnegative"),
    )
    op.create_index("ix_monthly_budgets_month", "monthly_budgets", ["month"])
