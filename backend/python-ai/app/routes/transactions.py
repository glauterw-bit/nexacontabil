"""Routes para reconciliação de transações."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List
from app.models.transaction import ReconciliationResult
from app.services.reconciliation_service import reconciliation_service

router = APIRouter(prefix="/transactions", tags=["transactions"])


class ReconciliationRequest(BaseModel):
    company_id: str
    sources: List[dict]  # NFs ou boletos
    targets: List[dict]  # Extratos ou boletos
    match_type: str = "nf_boleto"


@router.post("/reconcile", response_model=ReconciliationResult)
async def reconcile(request: ReconciliationRequest):
    """
    Reconcilia automaticamente documentos financeiros.
    match_type: "nf_boleto" | "boleto_extrato" | "nf_extrato"
    """
    if not request.sources or not request.targets:
        raise HTTPException(status_code=400, detail="sources e targets não podem estar vazios")

    if request.match_type not in ("nf_boleto", "boleto_extrato", "nf_extrato"):
        raise HTTPException(
            status_code=400,
            detail="match_type inválido. Use: nf_boleto, boleto_extrato, nf_extrato",
        )

    return await reconciliation_service.reconcile(
        sources=request.sources,
        targets=request.targets,
        match_type=request.match_type,
    )
