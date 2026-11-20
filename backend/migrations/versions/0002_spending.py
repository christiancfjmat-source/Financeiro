"""Expense register, tags and monthly category budgets."""

from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "tags",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("name_key", sa.String(250), nullable=False, unique=True),
    )
    op.create_table(
        "expenses",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("occurred_on", sa.Date, nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("amount_cents", sa.BigInteger, nullable=False),
        sa.Column("department_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("category_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("subcategory_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT")),
        sa.CheckConstraint("amount_cents > 0", name="expense_positive"),
    )
    op.create_index("ix_expenses_date_category", "expenses", ["occurred_on", "category_id"])
    for column in ("department_id", "category_id", "subcategory_id"):
        op.create_index(f"ix_expenses_{column}", "expenses", [column])
    op.create_table(
        "expense_tags",
        sa.Column("expense_id", sa.Integer, sa.ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_id", sa.Integer, sa.ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True),
    )
    op.create_index("ix_expense_tags_tag_id", "expense_tags", ["tag_id"])
    op.create_table(
        "monthly_budgets",
        sa.Column("category_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("month", sa.Date, primary_key=True),
        sa.Column("limit_cents", sa.BigInteger, nullable=False),
        sa.CheckConstraint("limit_cents >= 0", name="budget_nonnegative"),
    )
    op.create_index("ix_monthly_budgets_month", "monthly_budgets", ["month"])


def downgrade():
    op.drop_table("monthly_budgets")
    op.drop_table("expense_tags")
    op.drop_table("expenses")
    op.drop_table("tags")
