"""
Cliente HTTP para persistir dados no NestJS/PostgreSQL.
Chamado após processar documentos (upload ou WhatsApp) para alimentar o dashboard.
"""
import structlog
import httpx
from app.config import settings

logger = structlog.get_logger()


async def save_document_to_db(company_id: str, extracted_data: dict, source: str = "upload") -> bool:
    """Envia documento processado ao NestJS para salvar no PostgreSQL."""
    payload = {
        "company_id": company_id,
        "source": source,
        "result": {
            "status": "completed",
            "extracted_data": extracted_data,
        },
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                f"{settings.nestjs_api_url}/api/v1/documents/ingest",
                json=payload,
            )
            if r.is_success:
                logger.info("document_saved_to_db", company_id=company_id, source=source)
                return True
            logger.warning("nestjs_ingest_failed", status=r.status_code, body=r.text[:200])
    except Exception as e:
        logger.warning("nestjs_ingest_error", error=str(e))
    return False
