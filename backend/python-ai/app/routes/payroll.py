"""
Folha de Pagamento — análise de anomalias com IA e relatórios.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
import anthropic
from app.config import settings

router = APIRouter(prefix="/payroll", tags=["Payroll"])

class PayslipSummary(BaseModel):
    employee_name: str
    gross_salary: float
    inss: float
    irrf: float
    fgts: float
    net_salary: float

class PayrollAnalysisRequest(BaseModel):
    company_id: str
    month: str
    payslips: List[PayslipSummary]
    previous_month_total: Optional[float] = None

@router.post("/analyze")
async def analyze_payroll(req: PayrollAnalysisRequest):
    """Analisa folha de pagamento com IA e detecta anomalias."""
    total_gross = sum(p.gross_salary for p in req.payslips)
    total_inss = sum(p.inss for p in req.payslips)
    total_irrf = sum(p.irrf for p in req.payslips)
    total_fgts = sum(p.fgts for p in req.payslips)
    total_net = sum(p.net_salary for p in req.payslips)

    variation = None
    if req.previous_month_total and req.previous_month_total > 0:
        variation = ((total_gross - req.previous_month_total) / req.previous_month_total) * 100

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    prompt = f"""Analise esta folha de pagamento e identifique anomalias ou oportunidades:

Mês de referência: {req.month}
Funcionários: {len(req.payslips)}
Total Bruto: R$ {total_gross:,.2f}
Total INSS (empregado): R$ {total_inss:,.2f} ({(total_inss/total_gross*100):.1f}%)
Total IRRF: R$ {total_irrf:,.2f} ({(total_irrf/total_gross*100):.1f}%)
Total FGTS: R$ {total_fgts:,.2f} ({(total_fgts/total_gross*100):.1f}%)
Total Líquido: R$ {total_net:,.2f}
{"Variação em relação ao mês anterior: " + f"{variation:+.1f}%" if variation else ""}

Identifique: anomalias nos percentuais, conformidade com tabelas 2025, riscos trabalhistas."""

    response = await client.messages.create(
        model=settings.anthropic_model,
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600,
    )

    warnings = []
    inss_pct = (total_inss / total_gross * 100) if total_gross > 0 else 0
    if inss_pct < 7 or inss_pct > 15:
        warnings.append(f"INSS em {inss_pct:.1f}% — verificar cálculo")
    if variation and abs(variation) > 20:
        warnings.append(f"Variação de {variation:+.1f}% em relação ao mês anterior — verificar admissões/demissões")

    return {
        "month": req.month,
        "headcount": len(req.payslips),
        "totals": {
            "gross": total_gross,
            "inss_employee": total_inss,
            "irrf": total_irrf,
            "fgts": total_fgts,
            "net": total_net,
            "employer_cost": total_gross * 1.28,  # gross + ~28% encargos patronais
        },
        "percentages": {
            "inss_pct": round(inss_pct, 2),
            "irrf_pct": round(total_irrf / total_gross * 100, 2) if total_gross > 0 else 0,
            "fgts_pct": round(total_fgts / total_gross * 100, 2) if total_gross > 0 else 0,
        },
        "variation_pct": round(variation, 2) if variation else None,
        "warnings": warnings,
        "ai_analysis": response.content[0].text,
    }
