from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class DocumentType(str, Enum):
    NOTA_FISCAL = "nota_fiscal"
    BOLETO = "boleto"
    EXTRATO_BANCARIO = "extrato_bancario"
    CONTRATO = "contrato"
    RECIBO = "recibo"
    OTHER = "other"


class DocumentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    NEEDS_REVIEW = "needs_review"


class ExtractedTax(BaseModel):
    name: str
    rate: Optional[float] = None
    value: Optional[float] = None
    base: Optional[float] = None


class ExtractedLineItem(BaseModel):
    description: str
    quantity: Optional[float] = None
    unit_price: Optional[float] = None
    total: Optional[float] = None
    ncm: Optional[str] = None
    cfop: Optional[str] = None


class ExtractedDocumentData(BaseModel):
    """Dados extraídos de um documento pelo motor IDP."""
    document_type: DocumentType
    confidence_score: float = Field(ge=0.0, le=1.0)

    # Identificação
    number: Optional[str] = None
    series: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None

    # Emitente / Destinatário
    issuer_name: Optional[str] = None
    issuer_cnpj: Optional[str] = None
    issuer_address: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_cnpj: Optional[str] = None

    # Valores
    total_value: Optional[float] = None
    net_value: Optional[float] = None
    discount: Optional[float] = None
    freight: Optional[float] = None

    # Impostos
    taxes: List[ExtractedTax] = []

    # Itens (NF de produtos)
    line_items: List[ExtractedLineItem] = []

    # Campos extras
    description: Optional[str] = None
    payment_method: Optional[str] = None
    bank_code: Optional[str] = None
    bar_code: Optional[str] = None
    raw_text: Optional[str] = None

    # Alertas da IA
    alerts: List[str] = []
    suggestions: List[str] = []


class DocumentUploadRequest(BaseModel):
    company_id: str
    document_type: Optional[DocumentType] = None
    metadata: dict = {}


class DocumentProcessingResult(BaseModel):
    document_id: str
    status: DocumentStatus
    extracted_data: Optional[ExtractedDocumentData] = None
    accounting_suggestions: List[dict] = []
    fiscal_validation: Optional[dict] = None
    compliance_check: Optional[dict] = None
    processing_time_ms: int = 0
    error: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
