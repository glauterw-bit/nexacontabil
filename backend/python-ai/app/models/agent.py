from pydantic import BaseModel, Field
from typing import Optional, List, Any
from enum import Enum
from datetime import datetime


class AgentType(str, Enum):
    SUPERVISOR = "supervisor"
    TAX = "tax"
    ACCOUNTING = "accounting"
    COMPLIANCE = "compliance"
    AUDIT = "audit"


class AgentDecision(BaseModel):
    agent_type: AgentType
    input_summary: str
    decision: str
    reasoning: str
    confidence: float = Field(ge=0.0, le=1.0)
    warnings: List[str] = []
    recommendations: List[str] = []
    metadata: dict = {}
    created_at: datetime = Field(default_factory=datetime.utcnow)


class AgentWorkflowResult(BaseModel):
    workflow_id: str
    status: str
    decisions: List[AgentDecision] = []
    final_answer: str
    total_tokens_used: int = 0
    processing_time_ms: int = 0
    error: Optional[str] = None


class CopilotMessage(BaseModel):
    role: str  # "user" | "assistant"
    content: str
    metadata: dict = {}


class CopilotRequest(BaseModel):
    company_id: str
    messages: List[CopilotMessage]
    context_document_ids: List[str] = []


class CopilotResponse(BaseModel):
    message: str
    sources: List[dict] = []
    suggested_actions: List[str] = []
    agent_decisions: List[AgentDecision] = []
