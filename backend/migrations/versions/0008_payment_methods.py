"""Register payment methods and preserve payment terms per expense."""

from alembic import op
import sqlalchemy as sa

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    methods = op.create_table(
        "payment_methods",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("name_key", sa.String(250), nullable=False),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("due_day", sa.Integer),
        sa.UniqueConstraint("kind", "name_key", name="unique_payment_method_name"),
        sa.CheckConstraint("due_day IS NULL OR (kind = 'credito' AND due_day BETWEEN 1 AND 31)",
                           name="payment_method_due_day"),
    )
    defaults = [
        ("Não informada", "nao_informado"), ("Financiamento / empréstimo", "financiamento"),
        ("Cartão de crédito", "credito"), ("Cartão de débito", "debito"), ("Pix", "pix"),
        ("Boleto", "boleto"), ("Débito automático", "debito_automatico"),
        ("Transferência", "transferencia"), ("Dinheiro", "dinheiro"),
    ]
    op.bulk_insert(methods, [dict(name=name, name_key=name.casefold(), kind=kind) for name, kind in defaults])
    op.execute("ALTER TABLE expenses ADD COLUMN payment_method_id INTEGER REFERENCES payment_methods(id)")
    op.execute("UPDATE expenses SET payment_method_id = "
               "(SELECT id FROM payment_methods WHERE kind = CASE "
               "WHEN expenses.agreement_id IS NOT NULL OR expenses.credit_kind IS NOT NULL "
               "THEN 'financiamento' ELSE 'nao_informado' END)")
    op.add_column("expenses", sa.Column("payment_due_day", sa.Integer, sa.CheckConstraint(
        "payment_method_id IS NOT NULL AND (payment_due_day IS NULL OR payment_due_day BETWEEN 1 AND 31)",
        name="expense_payment_terms")))
    op.create_index("ix_expenses_payment_method_id", "expenses", ["payment_method_id"])


def downgrade():
    if op.get_bind().scalar(sa.text("SELECT count(*) FROM expenses JOIN payment_methods "
                                   "ON payment_methods.id = expenses.payment_method_id "
                                   "WHERE payment_methods.kind NOT IN ('nao_informado', 'financiamento')")):
        raise RuntimeError("O banco tem despesas vinculadas a formas de pagamento. Use um backup anterior para retornar.")
    op.drop_index("ix_expenses_payment_method_id", table_name="expenses")
    op.drop_column("expenses", "payment_due_day")
    op.drop_column("expenses", "payment_method_id")
    op.drop_table("payment_methods")
