"""
Relatórios Financeiros — análise de DRE e Balanço com IA.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import anthropic
from app.config import settings

router = APIRouter(prefix="/reports", tags=["Reports"])

class DREData(BaseModel):
    company_id: str
    period: str
    gross_revenue: float
    deductions: float
    net_revenue: float
    cogs: float
    gross_profit: float
    operating_expenses: float
    ebitda: float
    net_income: float
    previous_period_revenue: Optional[float] = None
    previous_period_net: Optional[float] = None

@router.post("/dre-analysis")
async def analyze_dre(req: DREData):
    """Análise narrativa do DRE com IA."""
    gross_margin = (req.gross_profit / req.net_revenue * 100) if req.net_revenue > 0 else 0
    net_margin = (req.net_income / req.net_revenue * 100) if req.net_revenue > 0 else 0
    ebitda_margin = (req.ebitda / req.net_revenue * 100) if req.net_revenue > 0 else 0

    revenue_growth = None
    if req.previous_period_revenue and req.previous_period_revenue > 0:
        revenue_growth = (req.gross_revenue - req.previous_period_revenue) / req.previous_period_revenue * 100

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.anthropic_model,
        messages=[{"role": "user", "content": f"""Analise o DRE do período {req.period}:

Receita Bruta: R$ {req.gross_revenue:,.2f}{f" (variação: {revenue_growth:+.1f}%)" if revenue_growth else ""}
Receita Líquida: R$ {req.net_revenue:,.2f}
Lucro Bruto: R$ {req.gross_profit:,.2f} (margem bruta: {gross_margin:.1f}%)
EBITDA: R$ {req.ebitda:,.2f} (margem EBITDA: {ebitda_margin:.1f}%)
Lucro Líquido: R$ {req.net_income:,.2f} (margem líquida: {net_margin:.1f}%)

Forneça análise financeira profissional com pontos de atenção e recomendações."""}],
        max_tokens=600,
    )

    return {
        "period": req.period,
        "kpis": {
            "gross_margin": round(gross_margin, 2),
            "net_margin": round(net_margin, 2),
            "ebitda_margin": round(ebitda_margin, 2),
            "revenue_growth": round(revenue_growth, 2) if revenue_growth else None,
        },
        "analysis": response.content[0].text,
    }
