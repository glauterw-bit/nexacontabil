"""
IDP Service — Intelligent Document Processing
Extrai dados estruturados de documentos usando GPT-4o Vision + OCR fallback.
"""
import base64
import json
import time
import structlog
from pathlib import Path
from typing import Optional
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

import openai
from openai import AsyncOpenAI

from app.config import settings
from app.models.document import (
    DocumentType,
    ExtractedDocumentData,
    ExtractedTax,
    ExtractedLineItem,
)

logger = structlog.get_logger()

EXTRACTION_PROMPT = """Analise este documento fiscal/financeiro brasileiro e extraia TODOS os dados em formato JSON estruturado.

Retorne EXATAMENTE este JSON (preencha null para campos não encontrados):
{
  "document_type": "nota_fiscal|boleto|extrato_bancario|contrato|recibo|other",
  "confidence_score": 0.95,
  "number": "número do documento",
  "series": "série (NF)",
  "issue_date": "DD/MM/AAAA",
  "due_date": "DD/MM/AAAA",
  "issuer_name": "nome do emitente",
  "issuer_cnpj": "XX.XXX.XXX/XXXX-XX",
  "issuer_address": "endereço completo",
  "recipient_name": "nome do destinatário",
  "recipient_cnpj": "XX.XXX.XXX/XXXX-XX",
  "total_value": 0.00,
  "net_value": 0.00,
  "discount": 0.00,
  "freight": 0.00,
  "taxes": [
    {"name": "ICMS", "rate": 12.0, "value": 120.00, "base": 1000.00},
    {"name": "PIS", "rate": 0.65, "value": 6.50, "base": 1000.00},
    {"name": "COFINS", "rate": 3.0, "value": 30.00, "base": 1000.00}
  ],
  "line_items": [
    {"description": "Produto/Serviço", "quantity": 1, "unit_price": 100.00, "total": 100.00, "ncm": "0000.00.00", "cfop": "1102"}
  ],
  "description": "descrição geral ou histórico",
  "payment_method": "boleto|pix|cartao|dinheiro|transferencia",
  "bank_code": "código do banco (boleto)",
  "bar_code": "linha digitável (boleto)",
  "alerts": ["alerta 1", "alerta 2"],
  "suggestions": ["sugestão 1"]
}

Seja preciso. Para documentos em português brasileiro, identifique todos os campos fiscais."""


class IDPService:
    def __init__(self):
        self.client = AsyncOpenAI(api_key=settings.openai_api_key)

    def _encode_image(self, image_bytes: bytes) -> str:
        return base64.b64encode(image_bytes).decode("utf-8")

    def _ocr_fallback(self, image_bytes: bytes) -> str:
        """OCR com Tesseract como fallback se Vision API falhar."""
        try:
            import pytesseract
            from PIL import Image
            import io
            image = Image.open(io.BytesIO(image_bytes))
            text = pytesseract.image_to_string(image, lang="por")
            return text
        except Exception as e:
            logger.warning("ocr_fallback_failed", error=str(e))
            return ""

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=1, max=10),
        retry=retry_if_exception_type((openai.RateLimitError, openai.APITimeoutError)),
    )
    async def _call_vision_api(self, image_b64: str, media_type: str = "image/jpeg") -> str:
        """Chama GPT-4o Vision com retry automático."""
        response = await self.client.chat.completions.create(
            model=settings.openai_vision_model,
            messages=[
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{image_b64}",
                                "detail": "high",
                            },
                        },
                        {"type": "text", "text": EXTRACTION_PROMPT},
                    ],
                }
            ],
            max_tokens=4096,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content

    async def extract_from_image(
        self, image_bytes: bytes, media_type: str = "image/jpeg"
    ) -> ExtractedDocumentData:
        """Extrai dados estruturados de uma imagem de documento."""
        start = time.time()
        logger.info("idp_extraction_start", media_type=media_type, size=len(image_bytes))

        raw_json: Optional[str] = None
        try:
            image_b64 = self._encode_image(image_bytes)
            raw_json = await self._call_vision_api(image_b64, media_type)
            data = json.loads(raw_json)
        except openai.APIError as e:
            logger.error("vision_api_failed", error=str(e))
            # Fallback: tenta extrair via OCR e passa o texto para o modelo de texto
            raw_text = self._ocr_fallback(image_bytes)
            if raw_text:
                data = await self._extract_from_text(raw_text)
            else:
                raise RuntimeError(f"IDP extraction failed: {e}") from e
        except json.JSONDecodeError as e:
            logger.error("json_parse_failed", error=str(e), raw=raw_json[:500] if raw_json else "")
            raise RuntimeError("Failed to parse extraction response as JSON") from e

        elapsed = int((time.time() - start) * 1000)
        logger.info("idp_extraction_complete", elapsed_ms=elapsed, confidence=data.get("confidence_score"))

        # Normaliza e constrói o modelo
        return self._parse_extracted_data(data)

    async def extract_from_pdf(self, pdf_bytes: bytes) -> ExtractedDocumentData:
        """Converte PDF para imagem e processa via Vision."""
        try:
            import pdf2image
            import io
            images = pdf2image.convert_from_bytes(pdf_bytes, dpi=200, first_page=1, last_page=1)
            if not images:
                raise ValueError("PDF has no pages")
            buf = io.BytesIO()
            images[0].save(buf, format="JPEG", quality=95)
            return await self.extract_from_image(buf.getvalue(), "image/jpeg")
        except Exception as e:
            logger.error("pdf_extraction_failed", error=str(e))
            raise RuntimeError(f"PDF extraction failed: {e}") from e

    async def _extract_from_text(self, text: str) -> dict:
        """Extrai dados de texto puro via GPT-4o (fallback do OCR)."""
        prompt = f"""Extraia dados estruturados do seguinte texto de documento fiscal brasileiro:\n\n{text}\n\n{EXTRACTION_PROMPT}"""
        response = await self.client.chat.completions.create(
            model=settings.openai_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
            response_format={"type": "json_object"},
        )
        return json.loads(response.choices[0].message.content)

    def _parse_extracted_data(self, data: dict) -> ExtractedDocumentData:
        """Converte dict raw em modelo Pydantic validado."""
        taxes = [
            ExtractedTax(
                name=t.get("name", ""),
                rate=t.get("rate"),
                value=t.get("value"),
                base=t.get("base"),
            )
            for t in data.get("taxes", [])
        ]
        line_items = [
            ExtractedLineItem(
                description=i.get("description", ""),
                quantity=i.get("quantity"),
                unit_price=i.get("unit_price"),
                total=i.get("total"),
                ncm=i.get("ncm"),
                cfop=i.get("cfop"),
            )
            for i in data.get("line_items", [])
        ]
        doc_type_map = {v.value: v for v in DocumentType}
        doc_type = doc_type_map.get(data.get("document_type", ""), DocumentType.OTHER)

        return ExtractedDocumentData(
            document_type=doc_type,
            confidence_score=float(data.get("confidence_score", 0.0)),
            number=data.get("number"),
            series=data.get("series"),
            issue_date=data.get("issue_date"),
            due_date=data.get("due_date"),
            issuer_name=data.get("issuer_name"),
            issuer_cnpj=data.get("issuer_cnpj"),
            issuer_address=data.get("issuer_address"),
            recipient_name=data.get("recipient_name"),
            recipient_cnpj=data.get("recipient_cnpj"),
            total_value=data.get("total_value"),
            net_value=data.get("net_value"),
            discount=data.get("discount"),
            freight=data.get("freight"),
            taxes=taxes,
            line_items=line_items,
            description=data.get("description"),
            payment_method=data.get("payment_method"),
            bank_code=data.get("bank_code"),
            bar_code=data.get("bar_code"),
            raw_text=data.get("raw_text"),
            alerts=data.get("alerts", []),
            suggestions=data.get("suggestions", []),
        )


idp_service = IDPService()
