from datetime import date, datetime
from typing import Annotated
import unicodedata
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import delete, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .models import BudgetRevision, Classification, Expense, SalaryRevision, Settings, Tag
from .schemas import ClassificationInput, ClassificationOutput, Preferences, Revision, ThemePreference

router = APIRouter(prefix="/api")


def session(request: Request):
    with Session(request.app.state.engine, expire_on_commit=False) as db:
        write = request.method in {"POST", "PUT", "PATCH", "DELETE"}
        db.connection().exec_driver_sql("BEGIN IMMEDIATE" if write else "BEGIN")
        yield db


Db = Annotated[Session, Depends(session)]


def find(db: Session, model, key):
    item = db.get(model, key)
    if item is None:
        raise HTTPException(404, "Registro não encontrado.")
    return item


def save(db: Session, message: str):
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise HTTPException(409, message) from error


def resolve_tags(db: Session, ids: list[int]) -> list[Tag]:
    tag_ids = set(ids)
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(tag_ids)).order_by(Tag.name_key))) if tag_ids else []
    if len(tags) != len(tag_ids):
        raise HTTPException(422, "Uma das tags selecionadas já não está disponível.")
    return tags


def local_date():
    return datetime.now(ZoneInfo("America/Sao_Paulo")).date()


def current_month():
    return local_date().replace(day=1)


MonthQuery = Annotated[str | None, Query(pattern=r"^\d{4}-\d{2}$")]


def month_start(month: str | None):
    try:
        return date.fromisoformat(f"{month}-01") if month else current_month()
    except ValueError as error:
        raise HTTPException(422, "Informe um mês válido.") from error


def normalize_name(name: str):
    return unicodedata.normalize("NFKC", name).casefold()


def check_future(month: date):
    if month.day != 1 or month <= current_month():
        raise HTTPException(422, "Selecione um mês posterior ao mês atual.")


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/settings", response_model=Preferences)
def read_settings(db: Db):
    return find(db, Settings, 1)


@router.put("/settings", response_model=Preferences)
def write_settings(data: Preferences, db: Db):
    settings = find(db, Settings, 1)
    for key, value in data.model_dump().items():
        setattr(settings, key, value)
    save(db, "Não foi possível salvar as preferências.")
    return settings


@router.patch("/settings/theme", response_model=Preferences)
def write_theme(data: ThemePreference, db: Db):
    settings = find(db, Settings, 1)
    settings.theme = data.theme
    save(db, "Não foi possível salvar o tema.")
    return settings


@router.get("/salary-revisions", response_model=list[Revision])
def list_revisions(db: Db):
    return list(db.scalars(select(SalaryRevision).order_by(SalaryRevision.effective_month)))


@router.post("/salary-revisions", response_model=Revision, status_code=201)
def create_revision(data: Revision, db: Db):
    check_future(data.effective_month)
    revision = SalaryRevision(**data.model_dump())
    db.add(revision)
    save(db, "Já existe um reajuste para esse mês.")
    return revision


@router.put("/salary-revisions/{month}", response_model=Revision)
def update_revision(month: date, data: Revision, db: Db):
    check_future(month)
    check_future(data.effective_month)
    revision = find(db, SalaryRevision, month)
    revision.effective_month = data.effective_month
    revision.amount_cents = data.amount_cents
    save(db, "Já existe um reajuste para esse mês.")
    return revision


@router.delete("/salary-revisions/{month}", status_code=204)
def delete_revision(month: date, db: Db):
    check_future(month)
    db.delete(find(db, SalaryRevision, month))
    save(db, "Não foi possível remover o reajuste.")
    return Response(status_code=204)


def salary_for_month(db: Session, reference: date) -> int:
    amount = db.scalar(select(SalaryRevision.amount_cents).where(SalaryRevision.effective_month <= reference)
                       .order_by(SalaryRevision.effective_month.desc()).limit(1))
    return find(db, Settings, 1).salary_cents if amount is None else amount


@router.get("/salary")
def read_salary(db: Db, month: MonthQuery = None):
    reference = month_start(month)
    return {"month": reference.isoformat()[:7], "amount_cents": salary_for_month(db, reference)}


@router.get("/classifications", response_model=list[ClassificationOutput])
def list_classifications(db: Db):
    return list(db.scalars(select(Classification).order_by(Classification.id)))


def apply_classification(db: Session, data: ClassificationInput, item: Classification):
    parent = find(db, Classification, data.parent_id) if data.parent_id else None
    level = parent.level + 1 if parent else 1
    if level > 3 or (item.id is not None and item.level != level):
        raise HTTPException(422, "Selecione um superior compatível com o nível deste item.")
    if parent and data.active and not parent.active:
        raise HTTPException(422, "Ative o item superior antes de ativar este registro.")
    item.name = data.name
    item.name_key = normalize_name(data.name)
    item.level = level
    item.parent_id = data.parent_id
    item.active = data.active
    if not data.active and item.id is not None:
        parents = [item.id]
        for _ in range(level, 3):
            children = list(db.scalars(select(Classification).where(Classification.parent_id.in_(parents))))
            for child in children:
                child.active = False
            parents = [child.id for child in children]


@router.post("/classifications", response_model=ClassificationOutput, status_code=201)
def create_classification(data: ClassificationInput, db: Db):
    item = Classification()
    apply_classification(db, data, item)
    db.add(item)
    save(db, "Já existe um item com esse nome neste nível da hierarquia.")
    return item


@router.put("/classifications/{item_id}", response_model=ClassificationOutput)
def update_classification(item_id: int, data: ClassificationInput, db: Db):
    item = find(db, Classification, item_id)
    apply_classification(db, data, item)
    save(db, "Já existe um item com esse nome neste nível da hierarquia.")
    return item


@router.delete("/classifications/{item_id}", status_code=204)
def delete_classification(item_id: int, db: Db):
    item = find(db, Classification, item_id)
    children = select(Classification.id).where(Classification.parent_id == item_id)
    if db.scalar(select(children.exists())):
        raise HTTPException(409, "Este item tem categorias ou subcategorias vinculadas. Você pode desativá-lo.")
    expenses = select(Expense.id).where(or_(
        Expense.department_id == item_id, Expense.category_id == item_id, Expense.subcategory_id == item_id,
    ))
    if db.scalar(select(expenses.exists())):
        raise HTTPException(409, "Este item tem despesas vinculadas. Você pode desativá-lo para preservar o histórico.")
    if item.level == 2:
        history = select(BudgetRevision.category_id).where(
            BudgetRevision.category_id == item_id,
            BudgetRevision.effective_month < current_month(),
            BudgetRevision.limit_cents.is_not(None),
        )
        if db.scalar(select(history.exists())):
            raise HTTPException(409, "Esta categoria tem tetos de meses encerrados. Você pode desativá-la para preservar o histórico.")
        db.execute(delete(BudgetRevision).where(BudgetRevision.category_id == item_id))
    db.delete(item)
    save(db, "Há registros vinculados a este item. Você pode desativá-lo.")
    return Response(status_code=204)
