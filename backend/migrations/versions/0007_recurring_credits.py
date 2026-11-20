"""Add dated and recurring income credits with tags."""

from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("income_credits", sa.Column("kind", sa.String(8), sa.CheckConstraint(
        "kind IN ('avulso', 'fixo')", name="income_credit_kind"), nullable=False, server_default="avulso"))
    for column in ("occurred_on", "ends_on", "closed_on", "effective_from", "effective_through"):
        op.add_column("income_credits", sa.Column(column, sa.Date))
    op.create_index("ix_income_credits_recurring_period", "income_credits",
                    ["kind", "effective_from", "effective_through"])
    op.create_table(
        "income_credit_tags",
        sa.Column("credit_id", sa.Integer, sa.ForeignKey("income_credits.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", sa.Integer, sa.ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True),
    )
    op.create_index("ix_income_credit_tags_tag_id", "income_credit_tags", ["tag_id"])


def downgrade():
    if (op.get_bind().scalar(sa.text("SELECT count(*) FROM income_credits WHERE kind = 'fixo' OR occurred_on IS NOT NULL"))
            or op.get_bind().scalar(sa.text("SELECT count(*) FROM income_credit_tags"))):
        raise RuntimeError("O banco tem créditos com data, recorrência ou tags. Use um backup anterior para retornar.")
    op.drop_table("income_credit_tags")
    op.drop_index("ix_income_credits_recurring_period", table_name="income_credits")
    for column in ("effective_through", "effective_from", "closed_on", "ends_on", "occurred_on", "kind"):
        op.drop_column("income_credits", column)
