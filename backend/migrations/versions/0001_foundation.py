"""Settings, salary revisions and expense classification."""

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

DEPARTMENTS = {
    "Moradia": ["Aluguel", "Condomínio", "Energia elétrica", "Água e esgoto", "Gás",
                "Internet", "Telefonia", "Manutenção", "Móveis e eletrodomésticos"],
    "Alimentação": ["Supermercado", "Restaurantes", "Delivery", "Lanches e cafés", "Alimentação no trabalho"],
    "Transporte": ["Financiamento do veículo", "Seguro", "Combustível", "Estacionamento", "Pedágios",
                   "Manutenção", "IPVA e licenciamento", "Uber e táxi", "Aluguel de veículos", "Passagens aéreas"],
    "Saúde": ["Consultas", "Medicamentos", "Exames", "Plano de saúde", "Cuidados pessoais"],
    "Compras": ["Compras pela internet", "Vestuário", "Calçados", "Eletrônicos", "Acessórios", "Itens para casa"],
    "Lazer": ["Restaurantes de lazer", "Viagens", "Passeios", "Assinaturas", "Entretenimento"],
    "Compromissos financeiros": ["Consórcio imobiliário", "Financiamentos", "Empréstimos", "Outros compromissos"],
    "Outros": ["Presentes", "Imprevistos", "Despesas extraordinárias", "Não classificados"],
}


def upgrade():
    settings = op.create_table(
        "settings",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("theme", sa.String(6), nullable=False),
        sa.Column("salary_cents", sa.BigInteger, nullable=False),
        sa.Column("extraordinary_cents", sa.BigInteger, nullable=False),
        sa.Column("payday", sa.Integer),
        sa.Column("opening_cash_cents", sa.BigInteger),
        sa.Column("opening_reserve_cents", sa.BigInteger),
        sa.Column("projection_months", sa.Integer, nullable=False),
        sa.Column("alert_attention", sa.Integer, nullable=False),
        sa.Column("alert_near", sa.Integer, nullable=False),
        sa.Column("alert_limit", sa.Integer, nullable=False),
        sa.CheckConstraint("id = 1", name="single_settings_row"),
        sa.CheckConstraint("salary_cents >= 0 AND extraordinary_cents >= 0", name="income_nonnegative"),
        sa.CheckConstraint("opening_reserve_cents >= 0", name="reserve_nonnegative"),
        sa.CheckConstraint("payday BETWEEN 1 AND 31", name="payday_range"),
        sa.CheckConstraint("projection_months BETWEEN 24 AND 60", name="projection_range"),
        sa.CheckConstraint("theme IN ('light', 'dark', 'system')", name="valid_theme"),
        sa.CheckConstraint("alert_attention > 0 AND alert_attention < alert_near "
                           "AND alert_near < alert_limit AND alert_limit <= 100", name="alert_order"),
    )
    op.bulk_insert(settings, [dict(id=1, name="Moradia", currency="BRL", theme="light",
                                  salary_cents=1401487, extraordinary_cents=0, projection_months=24,
                                  alert_attention=70, alert_near=90, alert_limit=100)])

    op.create_table(
        "salary_revisions",
        sa.Column("effective_month", sa.Date, primary_key=True),
        sa.Column("amount_cents", sa.BigInteger, nullable=False),
        sa.CheckConstraint("amount_cents >= 0", name="salary_nonnegative"),
    )
    classification = op.create_table(
        "classifications",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("name_key", sa.String(250), nullable=False),
        sa.Column("level", sa.Integer, nullable=False),
        sa.Column("parent_id", sa.Integer, sa.ForeignKey("classifications.id", ondelete="RESTRICT")),
        sa.Column("active", sa.Boolean, nullable=False),
        sa.CheckConstraint("(level = 1 AND parent_id IS NULL) OR "
                           "(level IN (2, 3) AND parent_id IS NOT NULL)", name="classification_level"),
        sa.UniqueConstraint("parent_id", "name_key", name="unique_classification_sibling"),
    )
    op.create_index("unique_department_name", "classifications", ["name_key"], unique=True,
                    sqlite_where=sa.text("parent_id IS NULL"), postgresql_where=sa.text("parent_id IS NULL"))
    rows = []
    for department, categories in DEPARTMENTS.items():
        parent_id = len(rows) + 1
        for name in [department, *categories]:
            is_department = len(rows) + 1 == parent_id
            rows.append(dict(id=len(rows) + 1, name=name, name_key=name.casefold(),
                             level=1 if is_department else 2,
                             parent_id=None if is_department else parent_id, active=True))
    op.bulk_insert(classification, rows)
    if op.get_bind().dialect.name == "postgresql":
        op.execute("SELECT setval(pg_get_serial_sequence('classifications', 'id'), "
                   "(SELECT max(id) FROM classifications))")


def downgrade():
    op.drop_table("classifications")
    op.drop_table("salary_revisions")
    op.drop_table("settings")
