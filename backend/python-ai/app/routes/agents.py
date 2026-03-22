"""Routes para Copilot e sistema multi-agente."""
from fastapi import APIRouter, HTTPException
from app.models.agent import CopilotRequest, CopilotResponse, AgentWorkflowResult
from app.services.agent_service import agent_service
from app.agents.supervisor_agent import supervisor_agent

router = APIRouter(prefix="/agents", tags=["agents"])


@router.post("/copilot", response_model=CopilotResponse)
async def copilot_chat(request: CopilotRequest):
    """Endpoint do Copilot conversacional para perguntas financeiras."""
    if not request.messages:
        raise HTTPException(status_code=400, detail="Mensagens não podem estar vazias")
    return await agent_service.copilot_chat(request)


@router.post("/analyze", response_model=AgentWorkflowResult)
async def analyze_document(payload: dict):
    """
    Executa o pipeline multi-agente sobre dados de documento já extraídos.
    Útil para re-analisar documentos ou analisar dados externos.
    """
    company_id = payload.get("company_id", "")
    document_data = payload.get("document_data", {})
    question = payload.get("question", "")

    if not company_id or not document_data:
        raise HTTPException(status_code=400, detail="company_id e document_data são obrigatórios")

    return await supervisor_agent.run(
        document_data=document_data,
        company_id=company_id,
        question=question,
    )
