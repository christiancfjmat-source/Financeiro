from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

MAX_CENTS = 999_999_999_999
Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
Money = Annotated[int, Field(strict=True, ge=0, le=MAX_CENTS)]
PositiveMoney = Annotated[int, Field(strict=True, ge=1, le=MAX_CENTS)]
Currency = Literal["BRL", "USD", "EUR"]
Theme = Literal["light", "dark", "system"]
RecordId = Annotated[int, Field(strict=True, gt=0)]
ExpenseKind = Literal["avulsa", "fixa"]
CreditKind = Literal["emprestimo", "financiamento"]
CreditMode = Literal["unica", "individual"]
IncomeCreditKind = Literal["avulso", "fixo"]
PublicPaymentKind = Literal["credito", "debito", "pix", "boleto", "debito_automatico", "transferencia", "dinheiro", "outro"]
PaymentKind = PublicPaymentKind | Literal["nao_informado", "financiamento"]
DueDay = Annotated[int, Field(strict=True, ge=1, le=31)]


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ThemePreference(Input):
    theme: Theme


class Preferences(Input):
    name: Name
    currency: Currency
    theme: Theme
    payday: Annotated[int, Field(ge=1, le=31)] | None
    salary_cents: Money
    extraordinary_cents: Money
    opening_cash_cents: Annotated[int, Field(strict=True, ge=-MAX_CENTS, le=MAX_CENTS)] | None
    opening_reserve_cents: Money | None
    projection_months: Annotated[int, Field(ge=24, le=60)]
    alert_attention: Annotated[int, Field(ge=1, le=100)]
    alert_near: Annotated[int, Field(ge=1, le=100)]
    alert_limit: Annotated[int, Field(ge=1, le=100)]

    @model_validator(mode="after")
    def check_alerts(self):
        if not self.alert_attention < self.alert_near < self.alert_limit:
            raise ValueError("Informe percentuais crescentes para atenção, aviso e limite.")
        return self


class Revision(Input):
    effective_month: date
    amount_cents: Money


class IncomeCreditInput(Input):
    month: date | None = None
    kind: IncomeCreditKind = "avulso"
    occurred_on: date | None = None
    ends_on: date | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=160)] = ""
    amount_cents: PositiveMoney
    tag_ids: list[RecordId] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def check_dates(self):
        if self.month is not None and self.month.day != 1:
            raise ValueError("Informe a competência do crédito.")
        if self.month is None and self.occurred_on is None:
            raise ValueError("Informe o mês ou a data do crédito.")
        if self.month and self.occurred_on and self.month != self.occurred_on.replace(day=1):
            raise ValueError("A data do crédito deve pertencer ao mês informado.")
        if self.kind == "fixo" and self.occurred_on is None:
            raise ValueError("Informe a data de início do crédito fixo.")
        if self.ends_on is not None and self.kind != "fixo":
            raise ValueError("Informe um término apenas para créditos fixos.")
        if self.ends_on and self.ends_on < self.occurred_on:
            raise ValueError("O término deve ser igual ou posterior ao início.")
        return self


class TagInput(Input):
    name: Name


class TagOutput(TagInput):
    id: int


class IncomeCreditOutput(BaseModel):
    id: int
    month: date | None
    description: str
    amount_cents: int
    kind: IncomeCreditKind
    occurred_on: date | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    closed_on: date | None = None
    can_edit: bool
    can_delete: bool
    can_close: bool
    tags: list[TagOutput]


class MonthlyIncome(BaseModel):
    month: str
    salary_cents: int
    credits_cents: int
    total_cents: int
    credits: list[IncomeCreditOutput]
    unassigned: list[IncomeCreditOutput]


class ClassificationInput(Input):
    name: Name
    parent_id: Annotated[int, Field(gt=0)] | None = None
    active: bool = True


class ClassificationOutput(ClassificationInput):
    id: int
    level: Literal[1, 2, 3]


class PaymentMethodInput(Input):
    name: Name
    kind: PublicPaymentKind
    due_day: DueDay | None = None

    @model_validator(mode="after")
    def check_due_day(self):
        if self.kind == "credito" and self.due_day is None:
            raise ValueError("Informe o dia de vencimento do cartão de crédito.")
        if self.kind != "credito" and self.due_day is not None:
            raise ValueError("O dia de vencimento é usado em cartões de crédito.")
        return self


class PaymentMethodOutput(BaseModel):
    id: int
    name: str
    kind: PaymentKind
    due_day: int | None


class ExpenseInput(Input):
    occurred_on: date
    kind: ExpenseKind = "avulsa"
    ends_on: date | None = None
    credit_kind: CreditKind | None = None
    credit_mode: CreditMode | None = None
    payment_method_id: RecordId | None = None
    amount_cents: PositiveMoney
    installment_count: Annotated[int, Field(strict=True, ge=1)] | None = None
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""
    department_id: RecordId
    category_id: RecordId
    subcategory_id: RecordId | None = None
    tag_ids: list[RecordId] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def check_expense_term(self):
        if self.installment_count is not None and (self.kind != "avulsa" or self.credit_kind is not None):
            raise ValueError("Use o número de parcelas em uma despesa comum avulsa.")
        if self.credit_mode and not self.credit_kind:
            raise ValueError("Selecione financiamento ou empréstimo antes de informar como cadastrar.")
        if self.creates_installments and (self.kind != "fixa" or self.ends_on is None):
            raise ValueError("Parcelas individuais exigem início e término.")
        if self.ends_on is not None and self.kind != "fixa":
            raise ValueError("Informe um término apenas para uma despesa fixa.")
        if self.ends_on is not None and self.ends_on < self.occurred_on:
            raise ValueError("O término deve ser igual ou posterior ao início.")
        return self

    @property
    def creates_installments(self) -> bool:
        # Payloads from before the mode selector used credit_kind for installments.
        return self.credit_kind is not None and self.credit_mode != "unica"


class CloseRecurrence(Input):
    closed_on: date


class InstallmentDetails(BaseModel):
    agreement_id: int
    agreement_description: str
    kind: CreditKind
    number: int
    total: int
    scheduled_on: date
    scheduled_cents: int


class PurchaseInstallmentDetails(BaseModel):
    number: int
    total: int
    purchase_on: date
    total_cents: int
    due_on: date


class AdvanceDetails(BaseModel):
    paid_on: date
    paid_cents: int


class AdvanceOption(BaseModel):
    expense_id: int
    category_id: int
    installment: InstallmentDetails


class AdvanceLine(Input):
    expense_id: RecordId
    paid_cents: PositiveMoney


class AdvanceRequest(Input):
    paid_on: date
    installments: list[AdvanceLine] = Field(min_length=1)

    @model_validator(mode="after")
    def check_installments(self):
        if len({line.expense_id for line in self.installments}) != len(self.installments):
            raise ValueError("Selecione cada parcela uma única vez.")
        return self


class ExpenseOutput(BaseModel):
    id: int
    occurred_on: date
    description: str
    amount_cents: int
    department_id: int
    category_id: int
    subcategory_id: int | None
    tags: list[TagOutput]
    kind: ExpenseKind
    credit_kind: CreditKind | None = None
    credit_mode: CreditMode | None = None
    payment_method: PaymentMethodOutput
    payment_due_day: int | None = None
    payment_due_on: date | None = None
    starts_on: date | None = None
    ends_on: date | None = None
    closed_on: date | None = None
    installment: InstallmentDetails | None = None
    purchase_installment: PurchaseInstallmentDetails | None = None
    advance: AdvanceDetails | None = None
    can_edit: bool
    can_delete: bool
    can_close: bool


class BudgetInput(Input):
    limit_cents: Money


class BudgetProgress(BudgetInput):
    category_id: int
    spent_cents: int
    available_cents: int
