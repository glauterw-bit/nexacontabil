"""Testes unitários para o motor de reconciliação."""
import pytest
from app.services.reconciliation_service import ReconciliationService, _normalize_cnpj, _normalize_value


@pytest.fixture
def svc():
    return ReconciliationService()


def test_normalize_cnpj():
    assert _normalize_cnpj("12.345.678/0001-90") == "12345678000190"
    assert _normalize_cnpj("") == ""
    assert _normalize_cnpj(None) == ""


def test_normalize_value():
    assert _normalize_value(1000.00) == 100000
    assert _normalize_value(1000.009) == 100001  # arredondamento
    assert _normalize_value(0) == 0


def test_values_match_exact(svc):
    assert svc._values_match(1000.00, 1000.00) is True


def test_values_match_within_tolerance(svc):
    assert svc._values_match(1000.00, 1000.50) is True  # dentro de R$1,00


def test_values_dont_match_outside_tolerance(svc):
    assert svc._values_match(1000.00, 1002.00) is False


def test_name_similarity_exact(svc):
    score = svc._compute_name_similarity("Fornecedor ABC", "Fornecedor ABC")
    assert score == 1.0


def test_name_similarity_partial(svc):
    score = svc._compute_name_similarity("Fornecedor ABC Ltda", "ABC")
    assert 0.3 < score < 1.0


def test_name_similarity_empty(svc):
    assert svc._compute_name_similarity("", "ABC") == 0.0
    assert svc._compute_name_similarity("ABC", "") == 0.0


def test_dates_match_exact(svc):
    match, diff = svc._dates_match("15/03/2024", "15/03/2024")
    assert match is True
    assert diff == 0


def test_dates_match_within_tolerance(svc):
    match, diff = svc._dates_match("15/03/2024", "18/03/2024")
    assert match is True
    assert diff == 3


def test_dates_no_match(svc):
    match, diff = svc._dates_match("01/03/2024", "20/03/2024")
    assert match is False


@pytest.mark.asyncio
async def test_reconcile_perfect_match(svc):
    sources = [
        {"id": "nf1", "issuer_name": "Fornecedor XYZ", "total_value": 1500.00, "due_date": "15/03/2024", "issuer_cnpj": "12345678000190"}
    ]
    targets = [
        {"id": "bol1", "description": "Fornecedor XYZ", "value": 1500.00, "date": "15/03/2024", "cnpj": "12345678000190"}
    ]
    result = await svc.reconcile(sources, targets, "nf_boleto")
    assert len(result.matches) == 1
    assert result.matches[0].confidence_score > 0.9
    assert result.matches[0].value_match is True


@pytest.mark.asyncio
async def test_reconcile_no_match(svc):
    sources = [
        {"id": "nf1", "issuer_name": "Empresa A", "total_value": 1000.00, "due_date": "01/01/2024"}
    ]
    targets = [
        {"id": "bol1", "description": "Empresa Z", "value": 9999.00, "date": "15/12/2023"}
    ]
    result = await svc.reconcile(sources, targets, "nf_boleto")
    assert len(result.matches) == 0
    assert "nf1" in result.unmatched_sources
    assert "bol1" in result.unmatched_targets
