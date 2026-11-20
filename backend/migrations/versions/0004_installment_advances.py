"""Individual credit installments and their advance payments."""

from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "credit_agreements",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("kind", sa.String(14), nullable=False),
        sa.Column("description", sa.String(500), nullable=False),
        sa.Column("starts_on", sa.Date, nullable=False),
        sa.Column("ends_on", sa.Date, nullable=False),
        sa.Column("installment_count", sa.Integer, nullable=False),
        sa.CheckConstraint("kind IN ('emprestimo', 'financiamento')", name="credit_kind"),
        sa.CheckConstraint("ends_on >= starts_on AND installment_count > 0", name="credit_term"),
    )
    op.execute("ALTER TABLE expenses ADD COLUMN agreement_id INTEGER REFERENCES credit_agreements(id)")
    op.add_column("expenses", sa.Column(
        "installment_number", sa.Integer,
        sa.CheckConstraint("(agreement_id IS NULL AND installment_number IS NULL) OR "
                           "(agreement_id IS NOT NULL AND installment_number IS NOT NULL "
                           "AND installment_number > 0 AND kind = 'avulsa')", name="expense_installment_link"),
    ))
    op.create_index("uq_expenses_agreement_installment", "expenses", ["agreement_id", "installment_number"], unique=True)
    op.create_table(
        "installment_advances",
        sa.Column("expense_id", sa.Integer, sa.ForeignKey("expenses.id", ondelete="RESTRICT"), primary_key=True),
        sa.Column("paid_on", sa.Date, nullable=False),
        sa.Column("paid_cents", sa.BigInteger, nullable=False),
        sa.CheckConstraint("paid_cents > 0", name="advance_positive"),
    )
    op.create_index("ix_installment_advances_paid_on", "installment_advances", ["paid_on"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM credit_agreements")):
        raise RuntimeError("O banco tem contratos de crédito. Use um backup anterior à migração para retornar.")
    op.drop_table("installment_advances")
    op.drop_index("uq_expenses_agreement_installment", table_name="expenses")
    op.drop_column("expenses", "installment_number")
    op.drop_column("expenses", "agreement_id")
    op.drop_table("credit_agreements")
