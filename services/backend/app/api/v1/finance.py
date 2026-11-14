import logging
from uuid import UUID
from datetime import date, datetime, time, timedelta
from typing import Optional, List, Literal
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import Response, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
import io

from app.core.db import get_db
from app.models.audit_log import AuditLog
from app.models.expense import Expense
from app.models.donation import Donation, DonationStatus, Donor
from app.api.deps import get_current_user, require_admin_route_permission

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/finance",
    tags=["finance"],
    dependencies=[Depends(require_admin_route_permission)],
)

# Pydantic Schemas
class ExpenseCreate(BaseModel):
    title: str
    category: str
    amount_cents: int
    currency: str = "TRY"
    receipt_no: str
    expense_date: Optional[datetime] = None

class ExpenseResponse(BaseModel):
    id: UUID
    title: str
    category: str
    amount_cents: int
    currency: str = "TRY"
    receipt_no: str
    expense_date: datetime

    class Config:
        from_attributes = True

@router.post("/expenses", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
async def create_expense(
    request: Request,
    payload: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    organization_id = UUID(request.state.organization_id)
    
    expense = Expense(
        organization_id=organization_id,
        title=payload.title,
        category=payload.category,
        amount_cents=payload.amount_cents,
        currency=(payload.currency or "TRY").upper()[:3],
        receipt_no=payload.receipt_no,
        expense_date=payload.expense_date or datetime.utcnow(),
        created_by_id=current_user.id,
    )
    
    db.add(expense)
    db.add(AuditLog(organization_id=organization_id, user_id=current_user.id, action="gider_ekle", details={"title": payload.title, "amount_cents": payload.amount_cents}))
    await db.commit()
    await db.refresh(expense)
    return expense

@router.get("/expenses", response_model=List[ExpenseResponse])
async def list_expenses(
    request: Request,
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    organization_id = request.state.organization_id
    query = select(Expense).where(Expense.organization_id == UUID(organization_id))
    
    if category:
        query = query.where(Expense.category == category)
        
    query = query.order_by(Expense.expense_date.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.put("/expenses/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    request: Request,
    expense_id: UUID,
    payload: ExpenseCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.organization_id == org_id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Harcama kaydı bulunamadı")
    expense.title = payload.title
    expense.category = payload.category
    expense.amount_cents = payload.amount_cents
    expense.currency = (payload.currency or expense.currency or "TRY").upper()[:3]
    expense.receipt_no = payload.receipt_no
    if payload.expense_date:
        expense.expense_date = payload.expense_date
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="gider_guncelle", details={"id": str(expense.id), "title": payload.title}))
    await db.commit()
    await db.refresh(expense)
    return expense


@router.delete("/expenses/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    request: Request,
    expense_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    org_id = UUID(request.state.organization_id)
    expense = (await db.execute(
        select(Expense).where(Expense.id == expense_id, Expense.organization_id == org_id)
    )).scalar_one_or_none()
    if not expense:
        raise HTTPException(status_code=404, detail="Harcama kaydı bulunamadı")
    db.add(AuditLog(organization_id=org_id, user_id=current_user.id, action="gider_sil", details={"id": str(expense.id), "title": expense.title}))
    await db.delete(expense)
    await db.commit()

@router.get("/stats")
async def get_finance_stats(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    organization_id = UUID(request.state.organization_id)
    
    # 1. Total income from confirmed donations
    income_query = select(func.sum(Donation.amount_cents)).where(
        Donation.organization_id == organization_id,
        Donation.status == DonationStatus.CONFIRMED
    )
    income_res = await db.execute(income_query)
    total_income_cents = income_res.scalar() or 0
    
    # 2. Total expenses
    expense_query = select(func.sum(Expense.amount_cents)).where(
        Expense.organization_id == organization_id
    )
    expense_res = await db.execute(expense_query)
    total_expense_cents = expense_res.scalar() or 0
    
    # 3. Spendings by category helper
    categories_query = select(Expense.category, func.sum(Expense.amount_cents)).where(
        Expense.organization_id == organization_id
    ).group_by(Expense.category)
    categories_res = await db.execute(categories_query)
    category_breakdown = {cat: val for cat, val in categories_res.all()}
    
    return {
        "total_income_lira": total_income_cents / 100,
        "total_expense_lira": total_expense_cents / 100,
        "balance_lira": (total_income_cents - total_expense_cents) / 100,
        "category_breakdown_lira": {cat: val / 100 for cat, val in category_breakdown.items()}
    }

@router.get("/derbis-export")
async def export_derbis_report(
    request: Request,
    start: Optional[date] = None,
    end: Optional[date] = None,
    format: Literal["csv", "xlsx"] = "csv",
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user)
):
    organization_id = UUID(request.state.organization_id)
    
    # Query confirmed donations with donor details
    query = (
        select(Donation, Donor)
        .join(Donor, Donation.donor_id == Donor.id)
        .where(Donation.organization_id == organization_id)
        .where(Donation.status == DonationStatus.CONFIRMED)
    )
    if start:
        query = query.where(Donation.created_at >= datetime.combine(start, time.min))
    if end:
        query = query.where(Donation.created_at < datetime.combine(end + timedelta(days=1), time.min))
    query = query.order_by(Donation.created_at.asc())
    result = await db.execute(query)
    rows = result.all()
    
    method_map = {"credit_card": "Kredi Kartı", "cash": "Nakit", "bank_transfer": "Havale/EFT"}
    if format == "xlsx":
        from app.utils.excel_export import build_corporate_xlsx

        org = getattr(request.state, "organization", None)
        period_parts = [p for p in (start.strftime("%d.%m.%Y") if start else None, end.strftime("%d.%m.%Y") if end else None) if p]
        subtitle = f"Dönem: {' - '.join(period_parts)}" if period_parts else "Tüm Onaylı Bağışlar"
        xlsx_rows = []
        for idx, (donation, donor) in enumerate(rows, 1):
            full_name = f"{donor.first_name} {donor.last_name or ''}".strip()
            tc_no = donor.tc_no or donor.tax_number or "Bilinmiyor"
            date_str = donation.created_at.strftime("%d.%m.%Y") if donation.created_at else ""
            pm_val = donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method)
            xlsx_rows.append([
                idx,
                donation.receipt_number,
                full_name,
                tc_no,
                date_str,
                round(float(donation.amount_lira), 2),
                method_map.get(pm_val, pm_val),
                (donation.donor_message or "Bağış").replace("\n", " "),
            ])
        xlsx_bytes = build_corporate_xlsx(
            title="DERBİS Ek-5/A Bağış Defteri",
            headers=["Sıra No", "Makbuz No", "Bağışçı Ad Soyadı", "T.C. Kimlik / Vergi No", "Bağış Tarihi", "Bağış Tutarı (TL)", "Ödeme Yöntemi", "Açıklama"],
            rows=xlsx_rows,
            org_name=getattr(org, "name", "") or "",
            subtitle=subtitle,
            primary_color=getattr(org, "theme_primary_color", None),
            currency_cols={6},
        )
        return Response(
            content=xlsx_bytes,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=derbis_bagis_defteri.xlsx"},
        )

    # Generate CSV with UTF-8 BOM so Microsoft Excel parses Turkish characters natively
    output = io.StringIO()
    # UTF-8 BOM bytes
    output.write('\ufeff')
    
    # Headers
    output.write("Sıra No;Makbuz No;Bağışçı Ad Soyadı;T.C. Kimlik / Vergi No;Bağış Tarihi;Bağış Tutarı (TL);Ödeme Yöntemi;Açıklama\n")
    
    for idx, (donation, donor) in enumerate(rows, 1):
        full_name = f"{donor.first_name} {donor.last_name or ''}".strip().replace(";", " ")
        tc_no = donor.tc_no or donor.tax_number or "Bilinmiyor"
        date_str = donation.created_at.strftime('%Y-%m-%d') if donation.created_at else ""
        amount = f"{donation.amount_lira:.2f}".replace(".", ",") # Turkish excel format uses comma for decimals
        pm_val = donation.payment_method.value if hasattr(donation.payment_method, "value") else str(donation.payment_method)
        payment_method = method_map.get(pm_val, pm_val)
        msg = (donation.donor_message or "Bağış").replace(";", " ").replace("\n", " ")
        
        output.write(f"{idx};{donation.receipt_number};{full_name};{tc_no};{date_str};{amount};{payment_method};{msg}\n")
        
    csv_data = output.getvalue()
    output.close()
    
    return StreamingResponse(
        io.BytesIO(csv_data.encode('utf-8-sig')), # Ensure correct encoding for excel
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=derbis_bagis_defteri.csv"}
    )
