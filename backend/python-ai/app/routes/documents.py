"""Routes para upload e processamento de documentos."""
import time
import uuid
import structlog
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from typing import Optional

from app.models.document import DocumentType, DocumentProcessingResult, DocumentStatus
from app.services.idp_service import idp_service
from app.agents.supervisor_agent import supervisor_agent
from app.services.nestjs_client import save_document_to_db

logger = structlog.get_logger()
router = APIRouter(prefix="/documents", tags=["documents"])

ALLOWED_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/tiff",
    "application/pdf",
}


@router.post("/upload", response_model=DocumentProcessingResult)
async def upload_document(
    file: UploadFile = File(...),
    company_id: str = Form(...),
    document_type: Optional[str] = Form(None),
):
    """
    Upload e processamento inteligente de documento fiscal/financeiro.
    Suporta: JPEG, PNG, WebP, TIFF, PDF.
    """
    start = time.time()
    doc_id = str(uuid.uuid4())
    logger.info("document_upload", doc_id=doc_id, company_id=company_id, filename=file.filename)

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de arquivo não suportado: {file.content_type}. Use: {', '.join(ALLOWED_TYPES)}",
        )

    file_bytes = await file.read()
    if len(file_bytes) > 20 * 1024 * 1024:  # 20MB
        raise HTTPException(status_code=413, detail="Arquivo muito grande. Máximo: 20MB")

    try:
        # Extrai dados do documento
        if file.content_type == "application/pdf":
            extracted = await idp_service.extract_from_pdf(file_bytes)
        else:
            extracted = await idp_service.extract_from_image(file_bytes, file.content_type)

        # Executa pipeline multi-agente
        workflow = await supervisor_agent.run(
            document_data=extracted.model_dump(),
            company_id=company_id,
        )

        # Agrega sugestões de lançamento das decisões do Accounting Agent
        accounting_decisions = [
            d for d in workflow.decisions if d.agent_type.value == "accounting"
        ]
        accounting_suggestions = []
        if accounting_decisions:
            meta = accounting_decisions[0].metadata or {}
            entries = meta.get("entries", [])
            if entries:
                accounting_suggestions = [{"entries": entries, "description": accounting_decisions[0].decision}]

        # Validação fiscal do Tax Agent
        tax_decisions = [d for d in workflow.decisions if d.agent_type.value == "tax"]
        fiscal_validation = None
        if tax_decisions:
            fiscal_validation = {
                "status": tax_decisions[0].decision,
                "risk_level": tax_decisions[0].metadata.get("risk_level", "BAIXO"),
                "warnings": tax_decisions[0].warnings,
            }

        # Compliance check
        compliance_decisions = [d for d in workflow.decisions if d.agent_type.value == "compliance"]
        compliance_check = None
        if compliance_decisions:
            compliance_check = {
                "status": compliance_decisions[0].decision,
                "risk_level": compliance_decisions[0].metadata.get("risk_level", "BAIXO"),
                "is_deductible": compliance_decisions[0].metadata.get("is_deductible"),
                "requires_approval": compliance_decisions[0].metadata.get("requires_approval"),
            }

        elapsed = int((time.time() - start) * 1000)
        result = DocumentProcessingResult(
            document_id=doc_id,
            status=DocumentStatus.COMPLETED,
            extracted_data=extracted,
            accounting_suggestions=accounting_suggestions,
            fiscal_validation=fiscal_validation,
            compliance_check=compliance_check,
            processing_time_ms=elapsed,
        )

        # Persiste no PostgreSQL via NestJS (alimenta o dashboard)
        import asyncio
        asyncio.create_task(save_document_to_db(company_id, extracted.model_dump(), source="upload"))

        return result

    except Exception as e:
        logger.error("document_processing_failed", doc_id=doc_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"Falha no processamento: {str(e)}")


@router.post("/extract-only", response_model=dict)
async def extract_only(
    file: UploadFile = File(...),
    company_id: str = Form(...),
):
    """Extrai dados do documento sem rodar o pipeline de agentes."""
    file_bytes = await file.read()

    if file.content_type == "application/pdf":
        extracted = await idp_service.extract_from_pdf(file_bytes)
    else:
        extracted = await idp_service.extract_from_image(file_bytes, file.content_type)

    return extracted.model_dump()
