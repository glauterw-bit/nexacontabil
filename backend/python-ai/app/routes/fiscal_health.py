"""
Score de Saúde Fiscal — índice composto de risco.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

router = APIRouter(prefix="/fiscal-health", tags=["Fiscal Health"])

class ObligationStatus(BaseModel):
    total: int
    paid_on_time: int
    overdue: int

class DocumentStats(BaseModel):
    total: int
    completed: int
    failed: int

class TransactionStats(BaseModel):
    total: int
    balanced: int

class FiscalHealthRequest(BaseModel):
    company_id: str
    obligations: ObligationStatus
    documents: DocumentStats
    transactions: TransactionStats
    payroll_compliance: Optional[float] = 100.0
    reconciliation_rate: Optional[float] = 0.0

@router.post("/{company_id}")
async def get_fiscal_health(company_id: str, req: FiscalHealthRequest):
    """Calcula score de saúde fiscal (0-100)."""

    # Component 1: Obrigações em dia (25 pts)
    obrig_score = 0
    if req.obligations.total > 0:
        on_time_rate = req.obligations.paid_on_time / req.obligations.total
        obrig_score = on_time_rate * 25
    else:
        obrig_score = 25  # sem obrigações = sem problema

    # Component 2: Documentos processados (20 pts)
    doc_score = 0
    if req.documents.total > 0:
        success_rate = req.documents.completed / req.documents.total
        failure_rate = req.documents.failed / req.documents.total
        doc_score = max(0, (success_rate - failure_rate * 0.5)) * 20
    else:
        doc_score = 15

    # Component 3: Lançamentos balanceados (15 pts)
    tx_score = 0
    if req.transactions.total > 0:
        balanced_rate = req.transactions.balanced / req.transactions.total
        tx_score = balanced_rate * 15
    else:
        tx_score = 15

    # Component 4: Compliance folha (15 pts)
    payroll_score = (req.payroll_compliance / 100) * 15

    # Component 5: Conciliação bancária (10 pts)
    reconcil_score = (req.reconciliation_rate / 100) * 10

    # Component 6: Base score (15 pts) - awarded if other components are healthy
    base_score = 15 if (obrig_score > 20 and doc_score > 15) else 10

    total_score = obrig_score + doc_score + tx_score + payroll_score + reconcil_score + base_score
    total_score = min(100, max(0, total_score))

    # Rating
    if total_score >= 85:
        rating = "Excelente"
        color = "green"
    elif total_score >= 70:
        rating = "Bom"
        color = "blue"
    elif total_score >= 50:
        rating = "Regular"
        color = "yellow"
    elif total_score >= 30:
        rating = "Atenção"
        color = "orange"
    else:
        rating = "Crítico"
        color = "red"

    components = [
        {"name": "Obrigações em Dia", "score": round(obrig_score, 1), "max": 25, "pct": round(obrig_score / 25 * 100)},
        {"name": "Processamento Documentos", "score": round(doc_score, 1), "max": 20, "pct": round(doc_score / 20 * 100)},
        {"name": "Lançamentos Contábeis", "score": round(tx_score, 1), "max": 15, "pct": round(tx_score / 15 * 100)},
        {"name": "Compliance Trabalhista", "score": round(payroll_score, 1), "max": 15, "pct": round(payroll_score / 15 * 100)},
        {"name": "Conciliação Bancária", "score": round(reconcil_score, 1), "max": 10, "pct": round(reconcil_score / 10 * 100)},
        {"name": "Saúde Geral", "score": round(base_score, 1), "max": 15, "pct": round(base_score / 15 * 100)},
    ]

    alerts = []
    if req.obligations.overdue > 0:
        alerts.append(f"{req.obligations.overdue} obrigação(ões) em atraso")
    if req.documents.failed > 0:
        alerts.append(f"{req.documents.failed} documento(s) com erro no processamento")
    if req.transactions.total > 0 and req.transactions.balanced < req.transactions.total:
        unbalanced = req.transactions.total - req.transactions.balanced
        alerts.append(f"{unbalanced} lançamento(s) desbalanceado(s)")

    return {
        "company_id": company_id,
        "score": round(total_score, 1),
        "rating": rating,
        "color": color,
        "components": components,
        "alerts": alerts,
        "calculated_at": datetime.utcnow().isoformat(),
    }
