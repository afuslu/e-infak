import logging
from uuid import UUID
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
import io

from app.core.db import get_db
from app.models.expense import Expense
from app.models.donation import Donation, DonationStatus, Donor
from app.api.deps import get_current_user

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/finance", tags=["finance"])

# Pydantic Schemas
class ExpenseCreate(BaseModel):
    title: str
    category: str
    amount_cents: int
    receipt_no: str
    expense_date: Optional[datetime] = None

class ExpenseResponse(BaseModel):
    id: UUID
    title: str
    category: str
    amount_cents: int
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
    organization_id = request.state.organization_id
    
    expense = Expense(
        organization_id=UUID(organization_id),
        title=payload.title,
        category=payload.category,
        amount_cents=payload.amount_cents,
        receipt_no=payload.receipt_no,
        expense_date=payload.expense_date or datetime.utcnow()
    )
    
    db.add(expense)
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
        .order_by(Donation.created_at.asc())
    )
    result = await db.execute(query)
    rows = result.all()
    
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
        payment_method = "Kredi Kartı" if donation.payment_method == "credit_card" else "Havale/EFT"
        msg = (donation.donor_message or "Bağış").replace(";", " ").replace("\n", " ")
        
        output.write(f"{idx};{donation.receipt_number};{full_name};{tc_no};{date_str};{amount};{payment_method};{msg}\n")
        
    csv_data = output.getvalue()
    output.close()
    
    return StreamingResponse(
        io.BytesIO(csv_data.encode('utf-8-sig')), # Ensure correct encoding for excel
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=derbis_bagis_defteri.csv"}
    )
