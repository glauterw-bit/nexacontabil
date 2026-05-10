"""
Relatório Executivo — geração e envio via WhatsApp.
"""
from fastapi import APIRouter, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import anthropic
import httpx
from app.config import settings
from datetime import datetime

router = APIRouter(prefix="/executive-report", tags=["Executive Report"])

class ReportRequest(BaseModel):
    company_id: str
    company_name: str
    reference_month: str  # "2025-03"
    whatsapp_instance: str
    whatsapp_phone: str
    # Financial data
    revenue: float
    expenses: float
    net_income: float
    documents_processed: int
    obligations_pending: int
    fiscal_health_score: float
    top_expenses: Optional[List[dict]] = []

@router.post("/generate/{company_id}")
async def generate_report(company_id: str, req: ReportRequest, background_tasks: BackgroundTasks):
    """Gera e envia relatório executivo pelo WhatsApp."""

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    margin = (req.net_income / req.revenue * 100) if req.revenue > 0 else 0

    response = await client.messages.create(
        model=settings.anthropic_model,
        system="""Você gera relatórios executivos mensais concisos para empresários brasileiros via WhatsApp.
Use emojis moderados. Seja direto, profissional e didático. Máximo 20 linhas.""",
        messages=[{"role": "user", "content": f"""Gere o relatório executivo de {req.reference_month} para {req.company_name}:

DADOS DO MÊS:
- Receita: R$ {req.revenue:,.2f}
- Despesas: R$ {req.expenses:,.2f}
- Resultado: R$ {req.net_income:,.2f} (margem {margin:.1f}%)
- Documentos processados: {req.documents_processed}
- Obrigações pendentes: {req.obligations_pending}
- Score de Saúde Fiscal: {req.fiscal_health_score}/100

Gere um relatório executivo completo com análise e recomendações."""}],
        max_tokens=800,
    )

    report_content = response.content[0].text

    # Send via WhatsApp Evolution API
    evolution_url = f"{settings.evolution_api_url}/message/sendText/{req.whatsapp_instance}"

    async def send_whatsapp():
        try:
            async with httpx.AsyncClient(timeout=30) as http:
                await http.post(
                    evolution_url,
                    json={"number": req.whatsapp_phone, "textMessage": {"text": report_content}},
                    headers={"apikey": settings.evolution_api_key},
                )
        except Exception:
            pass

    background_tasks.add_task(send_whatsapp)

    return {
        "company_id": company_id,
        "reference_month": req.reference_month,
        "content": report_content,
        "status": "sending",
        "generated_at": datetime.utcnow().isoformat(),
    }
