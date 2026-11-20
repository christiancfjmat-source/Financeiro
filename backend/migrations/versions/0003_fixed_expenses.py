"""Monthly fixed expenses and their period of validity."""

from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("expenses", sa.Column("kind", sa.String(8),
                                       sa.CheckConstraint("kind IN ('avulsa', 'fixa')", name="expense_kind"),
                                       server_default="avulsa", nullable=False))
    for column in ("ends_on", "closed_on", "effective_from", "effective_through"):
        op.add_column("expenses", sa.Column(column, sa.Date))
    op.create_index("ix_expenses_recurring_period", "expenses", ["kind", "effective_from", "effective_through"])
    op.execute("UPDATE settings SET projection_months = 36 WHERE id = 1 AND projection_months = 24")


def downgrade():
    # A downgrade would reinterpret fixed definitions as individual expenses.
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM expenses WHERE kind = 'fixa'")):
        raise RuntimeError("O banco tem despesas fixas. Use um backup anterior à migração para retornar.")
    op.drop_index("ix_expenses_recurring_period", table_name="expenses")
    for column in ("effective_through", "effective_from", "closed_on", "ends_on", "kind"):
        op.drop_column("expenses", column)
