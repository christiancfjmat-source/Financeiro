"""Store occasional income by month."""

from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "income_credits",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("month", sa.Date),
        sa.Column("description", sa.String(160), nullable=False),
        sa.Column("amount_cents", sa.BigInteger, nullable=False),
        sa.CheckConstraint("amount_cents > 0", name="income_credit_positive"),
    )
    op.create_index("ix_income_credits_month", "income_credits", ["month"])
    op.execute("INSERT INTO income_credits (description, amount_cents) "
               "SELECT 'Receita extraordinária', extraordinary_cents FROM settings WHERE extraordinary_cents > 0")
    op.execute("UPDATE settings SET extraordinary_cents = 0 WHERE extraordinary_cents > 0")


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM income_credits")):
        raise RuntimeError("O banco tem créditos eventuais. Use um backup anterior para retornar.")
    op.drop_table("income_credits")
