"""
Planejamento Tributário — comparação de regimes com IA.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import anthropic
from app.config import settings

router = APIRouter(prefix="/tax-planning", tags=["Tax Planning"])

class TaxPlanningRequest(BaseModel):
    company_id: str
    cnae_code: Optional[str] = None
    current_regime: str  # "simples" | "presumido" | "real"
    annual_revenue: float
    annual_cost: float
    annual_expenses: float
    annual_payroll: float
    activity_type: str  # "comercio" | "industria" | "servicos"

@router.post("/analyze")
async def analyze_tax_planning(req: TaxPlanningRequest):
    """Compara regimes tributários e recomenda o melhor."""
    revenue = req.annual_revenue

    # === SIMPLES NACIONAL ===
    # Anexo III (serviços) - tabela 2024
    simples_table = [
        (180000, 0.06, 0),
        (360000, 0.1120, 9360),
        (720000, 0.1350, 17640),
        (1800000, 0.16, 35640),
        (3600000, 0.21, 125640),
        (4800000, 0.33, 648000),
    ]
    simples_tax = 0
    for limit, rate, deduction in simples_table:
        if revenue <= limit:
            simples_tax = (revenue * rate - deduction)
            break
    else:
        simples_tax = revenue * 0.33 - 648000

    # === LUCRO PRESUMIDO ===
    presumption = 0.32 if req.activity_type == "servicos" else 0.08
    presumed_profit = revenue * presumption
    irpj_presumido = presumed_profit * 0.15
    adicional_presumido = max(0, (presumed_profit - 240000) * 0.10)
    csll_presumido = presumed_profit * 0.09
    pis_presumido = revenue * 0.0065
    cofins_presumido = revenue * 0.03
    iss_presumido = revenue * 0.05 if req.activity_type == "servicos" else 0
    total_presumido = irpj_presumido + adicional_presumido + csll_presumido + pis_presumido + cofins_presumido + iss_presumido

    # === LUCRO REAL ===
    real_profit = revenue - req.annual_cost - req.annual_expenses - req.annual_payroll
    irpj_real = max(0, real_profit * 0.15)
    adicional_real = max(0, (real_profit - 240000) * 0.10)
    csll_real = max(0, real_profit * 0.09)
    pis_real = revenue * 0.0165
    cofins_real = revenue * 0.076
    total_real = irpj_real + adicional_real + csll_real + pis_real + cofins_real

    regimes = {
        "simples_nacional": {"total_tax": max(0, simples_tax), "effective_rate": max(0, simples_tax) / revenue * 100},
        "lucro_presumido": {"total_tax": total_presumido, "effective_rate": total_presumido / revenue * 100},
        "lucro_real": {"total_tax": total_real, "effective_rate": total_real / revenue * 100},
    }

    best_regime = min(regimes, key=lambda k: regimes[k]["total_tax"])
    current_tax = regimes.get(req.current_regime.replace(" ", "_").lower(), {}).get("total_tax", 0)
    best_tax = regimes[best_regime]["total_tax"]
    potential_savings = current_tax - best_tax

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.anthropic_model,
        messages=[{"role": "user", "content": f"""Analise o planejamento tributário para empresa com:
- Receita anual: R$ {revenue:,.2f}
- Regime atual: {req.current_regime}
- Simples Nacional: R$ {regimes['simples_nacional']['total_tax']:,.2f} ({regimes['simples_nacional']['effective_rate']:.1f}%)
- Lucro Presumido: R$ {regimes['lucro_presumido']['total_tax']:,.2f} ({regimes['lucro_presumido']['effective_rate']:.1f}%)
- Lucro Real: R$ {regimes['lucro_real']['total_tax']:,.2f} ({regimes['lucro_real']['effective_rate']:.1f}%)
- Melhor regime: {best_regime} (economia de R$ {potential_savings:,.2f}/ano)

Dê recomendações práticas e caveats importantes."""}],
        max_tokens=600,
    )

    return {
        "company_id": req.company_id,
        "annual_revenue": revenue,
        "current_regime": req.current_regime,
        "comparison": regimes,
        "best_regime": best_regime,
        "current_annual_tax": current_tax,
        "best_annual_tax": best_tax,
        "potential_annual_savings": max(0, potential_savings),
        "potential_monthly_savings": max(0, potential_savings / 12),
        "recommendation": response.content[0].text,
    }
