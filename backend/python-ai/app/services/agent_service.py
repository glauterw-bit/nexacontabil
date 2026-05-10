"""
Agent Service — Ponto de entrada para o sistema multi-agente.
Gerencia o Copilot conversacional e análise de documentos.
"""
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

from app.config import settings
from app.models.agent import CopilotRequest, CopilotResponse, AgentDecision, AgentType
from app.services.rag_service import rag_service

logger = structlog.get_logger()

COPILOT_SYSTEM = """Você é o Copilot do DomoSYS — um assistente financeiro e contábil inteligente.

Você tem acesso ao histórico financeiro da empresa e pode responder perguntas sobre:
- Fluxo de caixa e projeções
- Análise de despesas e receitas
- Situação fiscal e tributária
- Lançamentos contábeis
- Indicadores financeiros (DRE, Balanço, etc.)
- Orientações sobre legislação tributária brasileira

Sempre baseie suas respostas em dados concretos quando disponíveis.
Seja direto, objetivo e use linguagem adequada para gestores e contadores.
Quando não tiver dados suficientes, diga claramente e oriente o usuário.
Nunca invente números — use apenas os dados fornecidos no contexto."""


class AgentService:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0.2,
            max_tokens=2048,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def copilot_chat(self, request: CopilotRequest) -> CopilotResponse:
        """Processa uma mensagem do Copilot com contexto RAG."""
        last_message = request.messages[-1].content if request.messages else ""

        # Busca contexto relevante no Vector DB
        context = await rag_service.query_knowledge_base(
            last_message, request.company_id
        )

        # Constrói histórico de mensagens
        messages = [SystemMessage(content=COPILOT_SYSTEM)]

        if context and context != "Nenhum histórico relevante encontrado.":
            messages.append(
                SystemMessage(
                    content=f"Contexto financeiro da empresa (histórico relevante):\n{context}"
                )
            )

        for msg in request.messages:
            if msg.role == "user":
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == "assistant":
                messages.append(AIMessage(content=msg.content))

        try:
            response = await self.llm.ainvoke(messages)
            answer = response.content

            # Sugere ações baseado no contexto
            suggested_actions = self._suggest_actions(last_message, answer)

            return CopilotResponse(
                message=answer,
                sources=[{"type": "rag_context", "content": context}] if context else [],
                suggested_actions=suggested_actions,
                agent_decisions=[],
            )
        except Exception as e:
            logger.error("copilot_failed", error=str(e))
            return CopilotResponse(
                message="Desculpe, ocorreu um erro ao processar sua pergunta. Tente novamente.",
                sources=[],
                suggested_actions=[],
            )

    def _suggest_actions(self, question: str, answer: str) -> list[str]:
        """Sugere ações baseadas no contexto da conversa."""
        actions = []
        q = question.lower()

        if any(w in q for w in ["nf", "nota fiscal", "fatura"]):
            actions.append("Visualizar documentos pendentes")
            actions.append("Iniciar reconciliação")
        if any(w in q for w in ["imposto", "fiscal", "sped", "icms", "pis"]):
            actions.append("Gerar relatório fiscal")
            actions.append("Ver análise do Tax Agent")
        if any(w in q for w in ["lançamento", "contábil", "conta"]):
            actions.append("Revisar lançamentos pendentes")
        if any(w in q for w in ["fluxo", "caixa", "saldo"]):
            actions.append("Ver dashboard financeiro")
            actions.append("Exportar relatório de fluxo de caixa")

        return actions[:3]


agent_service = AgentService()
