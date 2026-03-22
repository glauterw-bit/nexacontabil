from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class TransactionNature(str, Enum):
    DEBIT = "debit"
    CREDIT = "credit"


class TransactionStatus(str, Enum):
    DRAFT = "draft"
    PENDING_REVIEW = "pending_review"
    APPROVED = "approved"
    RECONCILED = "reconciled"
    REJECTED = "rejected"


class AccountingEntry(BaseModel):
    account_code: str
    account_name: str
    nature: TransactionNature
    value: float
    cost_center: Optional[str] = None
    description: Optional[str] = None


class TransactionSuggestion(BaseModel):
    """Sugestão de lançamento contábil gerada pela IA."""
    confidence_score: float = Field(ge=0.0, le=1.0)
    description: str
    entries: List[AccountingEntry]
    reasoning: str
    similar_transactions: List[str] = []
    warnings: List[str] = []


class ReconciliationMatch(BaseModel):
    source_id: str
    target_id: str
    match_type: str  # "nf_boleto", "boleto_extrato", "nf_extrato"
    confidence_score: float = Field(ge=0.0, le=1.0)
    value_match: bool
    date_difference_days: Optional[int] = None
    description_similarity: float = Field(ge=0.0, le=1.0)
    discrepancies: List[str] = []


class ReconciliationResult(BaseModel):
    matches: List[ReconciliationMatch] = []
    unmatched_sources: List[str] = []
    unmatched_targets: List[str] = []
    total_matched_value: float = 0.0
    total_unmatched_value: float = 0.0
