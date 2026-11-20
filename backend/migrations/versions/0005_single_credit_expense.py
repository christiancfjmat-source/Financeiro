"""Optional credit classification for expenses stored as a single record."""

from alembic import op
import sqlalchemy as sa

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("expenses", sa.Column(
        "credit_kind", sa.String(14),
        sa.CheckConstraint("credit_kind IS NULL OR (agreement_id IS NULL AND "
                           "credit_kind IN ('emprestimo', 'financiamento'))",
                           name="expense_single_credit_kind"),
    ))


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM expenses WHERE credit_kind IS NOT NULL")):
        raise RuntimeError("O banco tem financiamentos ou empréstimos cadastrados como despesa única.")
    op.drop_column("expenses", "credit_kind")
