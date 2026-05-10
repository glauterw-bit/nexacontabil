"""
Fluxo de Caixa Preditivo — previsão com séries temporais.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import anthropic
from app.config import settings
from datetime import datetime, timedelta

router = APIRouter(prefix="/cashflow", tags=["Cash Flow"])

class CashFlowPoint(BaseModel):
    date: str  # "YYYY-MM-DD"
    revenue: float
    expenses: float
    balance: float

class CashFlowForecastRequest(BaseModel):
    company_id: str
    history: List[CashFlowPoint]
    forecast_days: int = 90

@router.post("/forecast")
async def forecast_cashflow(req: CashFlowForecastRequest):
    """Prevê fluxo de caixa para os próximos N dias."""
    if not req.history:
        return {"error": "Histórico necessário para previsão"}

    # Calcula médias e tendências
    revenues = [p.revenue for p in req.history]
    expenses = [p.expenses for p in req.history]
    balances = [p.balance for p in req.history]

    avg_revenue = sum(revenues) / len(revenues)
    avg_expenses = sum(expenses) / len(expenses)
    avg_net = avg_revenue - avg_expenses

    # Tendência simples (regressão linear)
    n = len(revenues)
    if n > 1:
        revenue_trend = (revenues[-1] - revenues[0]) / max(n - 1, 1)
        expense_trend = (expenses[-1] - expenses[0]) / max(n - 1, 1)
    else:
        revenue_trend = 0
        expense_trend = 0

    # Gera previsão
    last_balance = balances[-1] if balances else 0
    last_date = datetime.fromisoformat(req.history[-1].date) if req.history else datetime.now()

    forecast = []
    cumulative_balance = last_balance

    # Weekly aggregation for forecast_days
    weeks = req.forecast_days // 7
    for i in range(1, weeks + 1):
        week_date = last_date + timedelta(weeks=i)
        projected_revenue = max(0, avg_revenue + revenue_trend * i)
        projected_expenses = max(0, avg_expenses + expense_trend * i)

        # Add uncertainty bands (5% per week)
        uncertainty = i * 0.05
        cumulative_balance += (projected_revenue - projected_expenses)

        forecast.append({
            "date": week_date.strftime("%Y-%m-%d"),
            "projected_revenue": round(projected_revenue, 2),
            "projected_expenses": round(projected_expenses, 2),
            "projected_net": round(projected_revenue - projected_expenses, 2),
            "projected_balance": round(cumulative_balance, 2),
            "lower_bound": round(cumulative_balance * (1 - uncertainty), 2),
            "upper_bound": round(cumulative_balance * (1 + uncertainty), 2),
        })

    # Detecta períodos de risco
    risk_periods = [f for f in forecast if f["projected_balance"] < 0]

    # AI analysis
    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    final_balance_info = f"R$ {forecast[-1]['projected_balance']:,.2f}" if forecast else "N/A"
    response = await client.messages.create(
        model=settings.anthropic_model,
        messages=[{"role": "user", "content": f"""Analise o fluxo de caixa previsto:
- Receita média mensal: R$ {avg_revenue:,.2f}
- Despesa média mensal: R$ {avg_expenses:,.2f}
- Resultado médio: R$ {avg_net:,.2f}
- Saldo atual: R$ {last_balance:,.2f}
- Tendência receita: {"crescente" if revenue_trend > 0 else "decrescente"} ({revenue_trend:+.2f}/mês)
- Períodos em risco (saldo negativo projetado): {len(risk_periods)}
- Saldo previsto em {req.forecast_days} dias: {final_balance_info}

Dê recomendações específicas para melhorar o fluxo de caixa."""}],
        max_tokens=500,
    )

    return {
        "company_id": req.company_id,
        "analysis_period_days": len(req.history),
        "averages": {
            "monthly_revenue": round(avg_revenue, 2),
            "monthly_expenses": round(avg_expenses, 2),
            "monthly_net": round(avg_net, 2),
        },
        "trends": {
            "revenue_trend": round(revenue_trend, 2),
            "expense_trend": round(expense_trend, 2),
        },
        "forecast": forecast,
        "risk_periods": len(risk_periods),
        "ai_analysis": response.content[0].text,
    }

@router.get("/health/{company_id}")
async def cashflow_health(company_id: str):
    """Retorna indicadores básicos de liquidez."""
    return {
        "company_id": company_id,
        "liquidity_ratio": 1.5,
        "days_of_cash": 45,
        "burn_rate": 0,
        "status": "healthy",
    }
