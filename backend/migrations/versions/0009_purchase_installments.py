"""Store the monthly schedule for installment purchases."""

from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("expenses", sa.Column("installment_count", sa.Integer, sa.CheckConstraint(
        "installment_count > 0", name="expense_installment_count_positive")))
    op.create_table(
        "purchase_installments",
        sa.Column("expense_id", sa.Integer, sa.ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("number", sa.Integer, primary_key=True),
        sa.Column("due_on", sa.Date, nullable=False),
        sa.Column("amount_cents", sa.BigInteger, nullable=False),
        sa.CheckConstraint("number > 0 AND amount_cents > 0", name="purchase_installment_positive"),
    )
    op.create_index("ix_purchase_installments_due_on", "purchase_installments", ["due_on"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM purchase_installments")):
        raise RuntimeError("O banco tem compras parceladas. Use um backup anterior para retornar.")
    op.drop_table("purchase_installments")
    op.drop_column("expenses", "installment_count")
