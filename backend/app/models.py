from datetime import date

from sqlalchemy import BigInteger, CheckConstraint, Column, ForeignKey, Index, Integer, String, Table, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Settings(Base):
    __tablename__ = "settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="single_settings_row"),
        CheckConstraint("salary_cents >= 0 AND extraordinary_cents >= 0", name="income_nonnegative"),
        CheckConstraint("opening_reserve_cents >= 0", name="reserve_nonnegative"),
        CheckConstraint("payday BETWEEN 1 AND 31", name="payday_range"),
        CheckConstraint("projection_months BETWEEN 24 AND 60", name="projection_range"),
        CheckConstraint("theme IN ('light', 'dark', 'system')", name="valid_theme"),
        CheckConstraint("alert_attention > 0 AND alert_attention < alert_near "
                        "AND alert_near < alert_limit AND alert_limit <= 100", name="alert_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    currency: Mapped[str] = mapped_column(String(3))
    theme: Mapped[str] = mapped_column(String(6))
    salary_cents: Mapped[int] = mapped_column(BigInteger)
    extraordinary_cents: Mapped[int] = mapped_column(BigInteger)
    payday: Mapped[int | None]
    opening_cash_cents: Mapped[int | None] = mapped_column(BigInteger)
    opening_reserve_cents: Mapped[int | None] = mapped_column(BigInteger)
    projection_months: Mapped[int]
    alert_attention: Mapped[int]
    alert_near: Mapped[int]
    alert_limit: Mapped[int]


class SalaryRevision(Base):
    __tablename__ = "salary_revisions"
    __table_args__ = (CheckConstraint("amount_cents >= 0", name="salary_nonnegative"),)

    effective_month: Mapped[date] = mapped_column(primary_key=True)
    amount_cents: Mapped[int] = mapped_column(BigInteger)


class IncomeCredit(Base):
    __tablename__ = "income_credits"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="income_credit_positive"),
        Index("ix_income_credits_recurring_period", "kind", "effective_from", "effective_through"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    month: Mapped[date | None] = mapped_column(index=True)
    kind: Mapped[str] = mapped_column(String(8), CheckConstraint(
        "kind IN ('avulso', 'fixo')", name="income_credit_kind"), server_default="avulso")
    occurred_on: Mapped[date | None]
    ends_on: Mapped[date | None]
    closed_on: Mapped[date | None]
    effective_from: Mapped[date | None]
    effective_through: Mapped[date | None]
    description: Mapped[str] = mapped_column(String(160))
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    tags: Mapped[list["Tag"]] = relationship(secondary="income_credit_tags", order_by="Tag.name_key")


class Classification(Base):
    __tablename__ = "classifications"
    __table_args__ = (
        CheckConstraint("(level = 1 AND parent_id IS NULL) OR "
                        "(level IN (2, 3) AND parent_id IS NOT NULL)", name="classification_level"),
        UniqueConstraint("parent_id", "name_key", name="unique_classification_sibling"),
        Index("unique_department_name", "name_key", unique=True,
              sqlite_where=text("parent_id IS NULL"), postgresql_where=text("parent_id IS NULL")),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    name_key: Mapped[str] = mapped_column(String(250))
    level: Mapped[int]
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("classifications.id", ondelete="RESTRICT"))
    active: Mapped[bool]


expense_tags = Table(
    "expense_tags", Base.metadata,
    Column("expense_id", Integer, ForeignKey("expenses.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True, index=True),
)

income_credit_tags = Table(
    "income_credit_tags", Base.metadata,
    Column("credit_id", Integer, ForeignKey("income_credits.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="RESTRICT"), primary_key=True, index=True),
)


class Tag(Base):
    __tablename__ = "tags"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    name_key: Mapped[str] = mapped_column(String(250), unique=True)


class CreditAgreement(Base):
    __tablename__ = "credit_agreements"
    __table_args__ = (
        CheckConstraint("kind IN ('emprestimo', 'financiamento')", name="credit_kind"),
        CheckConstraint("ends_on >= starts_on AND installment_count > 0", name="credit_term"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(14))
    description: Mapped[str] = mapped_column(String(500))
    starts_on: Mapped[date]
    ends_on: Mapped[date]
    installment_count: Mapped[int]


class InstallmentAdvance(Base):
    __tablename__ = "installment_advances"
    __table_args__ = (CheckConstraint("paid_cents > 0", name="advance_positive"),)

    expense_id: Mapped[int] = mapped_column(ForeignKey("expenses.id", ondelete="RESTRICT"), primary_key=True)
    paid_on: Mapped[date] = mapped_column(index=True)
    paid_cents: Mapped[int] = mapped_column(BigInteger)


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (
        CheckConstraint("amount_cents > 0", name="expense_positive"),
        Index("ix_expenses_date_category", "occurred_on", "category_id"),
        Index("ix_expenses_recurring_period", "kind", "effective_from", "effective_through"),
        Index("uq_expenses_agreement_installment", "agreement_id", "installment_number", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    occurred_on: Mapped[date]
    kind: Mapped[str] = mapped_column(String(8), CheckConstraint("kind IN ('avulsa', 'fixa')", name="expense_kind"),
                                      server_default="avulsa")
    ends_on: Mapped[date | None]
    closed_on: Mapped[date | None]
    effective_from: Mapped[date | None]
    effective_through: Mapped[date | None]
    agreement_id: Mapped[int | None] = mapped_column(ForeignKey("credit_agreements.id"))
    installment_number: Mapped[int | None] = mapped_column(CheckConstraint(
        "(agreement_id IS NULL AND installment_number IS NULL) OR "
        "(agreement_id IS NOT NULL AND installment_number IS NOT NULL AND installment_number > 0 AND kind = 'avulsa')",
        name="expense_installment_link",
    ))
    credit_kind: Mapped[str | None] = mapped_column(String(14), CheckConstraint(
        "credit_kind IS NULL OR (agreement_id IS NULL AND credit_kind IN ('emprestimo', 'financiamento'))",
        name="expense_single_credit_kind",
    ))
    description: Mapped[str] = mapped_column(String(500))
    amount_cents: Mapped[int] = mapped_column(BigInteger)
    department_id: Mapped[int] = mapped_column(ForeignKey("classifications.id", ondelete="RESTRICT"), index=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("classifications.id", ondelete="RESTRICT"), index=True)
    subcategory_id: Mapped[int | None] = mapped_column(ForeignKey("classifications.id", ondelete="RESTRICT"), index=True)
    tags: Mapped[list[Tag]] = relationship(secondary=expense_tags, order_by=Tag.name_key)
    agreement: Mapped[CreditAgreement | None] = relationship()
    advance: Mapped[InstallmentAdvance | None] = relationship()


class MonthlyBudget(Base):
    __tablename__ = "monthly_budgets"
    __table_args__ = (
        CheckConstraint("limit_cents >= 0", name="budget_nonnegative"),
        Index("ix_monthly_budgets_month", "month"),
    )

    category_id: Mapped[int] = mapped_column(ForeignKey("classifications.id", ondelete="RESTRICT"), primary_key=True)
    month: Mapped[date] = mapped_column(primary_key=True)
    limit_cents: Mapped[int] = mapped_column(BigInteger)
