"""Testes unitários para o IDP Service."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from app.services.idp_service import IDPService
from app.models.document import DocumentType


MOCK_EXTRACTION_RESPONSE = {
    "document_type": "nota_fiscal",
    "confidence_score": 0.97,
    "number": "001234",
    "series": "1",
    "issue_date": "15/03/2024",
    "due_date": "30/03/2024",
    "issuer_name": "Fornecedor XYZ Ltda",
    "issuer_cnpj": "12.345.678/0001-90",
    "issuer_address": "Rua das Flores, 123 - São Paulo/SP",
    "recipient_name": "Empresa ABC S.A.",
    "recipient_cnpj": "98.765.432/0001-10",
    "total_value": 1500.00,
    "net_value": 1350.00,
    "discount": 0.0,
    "freight": 50.00,
    "taxes": [
        {"name": "ICMS", "rate": 12.0, "value": 162.00, "base": 1350.00},
        {"name": "PIS", "rate": 0.65, "value": 8.78, "base": 1350.00},
        {"name": "COFINS", "rate": 3.0, "value": 40.50, "base": 1350.00},
    ],
    "line_items": [
        {
            "description": "Software de Gestão",
            "quantity": 1,
            "unit_price": 1350.00,
            "total": 1350.00,
            "ncm": "8523.49.90",
            "cfop": "5102",
        }
    ],
    "description": "Serviço de software - Março/2024",
    "payment_method": "boleto",
    "alerts": [],
    "suggestions": ["Verificar dedutibilidade do software"],
}


@pytest.fixture
def idp():
    return IDPService()


@pytest.mark.asyncio
async def test_extract_from_image_success(idp):
    """Testa extração bem-sucedida de imagem via Vision API."""
    import json

    mock_response = MagicMock()
    mock_response.choices = [MagicMock()]
    mock_response.choices[0].message.content = json.dumps(MOCK_EXTRACTION_RESPONSE)

    with patch.object(idp.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
        result = await idp.extract_from_image(b"fake_image_bytes", "image/jpeg")

    assert result.document_type == DocumentType.NOTA_FISCAL
    assert result.confidence_score == 0.97
    assert result.issuer_name == "Fornecedor XYZ Ltda"
    assert result.total_value == 1500.00
    assert len(result.taxes) == 3
    assert len(result.line_items) == 1


@pytest.mark.asyncio
async def test_parse_taxes(idp):
    """Testa parsing correto dos impostos."""
    data = idp._parse_extracted_data(MOCK_EXTRACTION_RESPONSE)
    icms = next((t for t in data.taxes if t.name == "ICMS"), None)
    assert icms is not None
    assert icms.rate == 12.0
    assert icms.value == 162.00


@pytest.mark.asyncio
async def test_extract_fallback_on_api_error(idp):
    """Testa fallback para OCR quando Vision API falha."""
    import openai

    with patch.object(
        idp.client.chat.completions, "create", new=AsyncMock(side_effect=openai.APIError("error", request=MagicMock(), body=None))
    ):
        with patch.object(idp, "_ocr_fallback", return_value="Nota Fiscal 001"):
            with patch.object(idp, "_extract_from_text", new=AsyncMock(return_value=MOCK_EXTRACTION_RESPONSE)):
                result = await idp.extract_from_image(b"fake_image", "image/jpeg")
                assert result is not None


def test_encode_image(idp):
    """Testa encoding base64 de imagem."""
    img = b"test_bytes"
    encoded = idp._encode_image(img)
    import base64
    assert base64.b64decode(encoded) == img


def test_parse_document_type_fallback(idp):
    """Testa fallback para OTHER quando tipo desconhecido."""
    data = {**MOCK_EXTRACTION_RESPONSE, "document_type": "tipo_desconhecido"}
    result = idp._parse_extracted_data(data)
    assert result.document_type == DocumentType.OTHER
