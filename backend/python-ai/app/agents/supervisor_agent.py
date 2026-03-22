"""
Supervisor Agent — Orquestra o fluxo de trabalho entre os agentes especializados.
Usa LangGraph para criar um grafo de decisão.
"""
import json
import time
import uuid
import structlog
from typing import Annotated, TypedDict, Sequence, Literal

from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage, BaseMessage
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.models.agent import AgentDecision, AgentType, AgentWorkflowResult
from app.prompts.system_prompts import SUPERVISOR_SYSTEM_PROMPT
from app.agents.tax_agent import tax_agent
from app.agents.accounting_agent import accounting_agent
from app.agents.compliance_agent import compliance_agent
from app.agents.audit_agent import audit_agent

logger = structlog.get_logger()


class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    document_data: dict
    company_id: str
    decisions: list[dict]
    next_agent: str
    final_answer: str
    iteration: int


def _get_llm(use_fallback: bool = False) -> ChatOpenAI | ChatAnthropic:
    if use_fallback or not settings.openai_api_key:
        return ChatAnthropic(
            model=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
            max_tokens=4096,
        )
    return ChatOpenAI(
        model=settings.openai_model,
        api_key=settings.openai_api_key,
        temperature=0,
        max_tokens=4096,
    )


class SupervisorAgent:
    def __init__(self):
        self.graph = self._build_graph()

    def _build_graph(self) -> StateGraph:
        graph = StateGraph(AgentState)

        graph.add_node("supervisor", self._supervisor_node)
        graph.add_node("tax", self._tax_node)
        graph.add_node("accounting", self._accounting_node)
        graph.add_node("compliance", self._compliance_node)
        graph.add_node("audit", self._audit_node)
        graph.add_node("finalize", self._finalize_node)

        graph.set_entry_point("supervisor")

        graph.add_conditional_edges(
            "supervisor",
            self._route,
            {
                "tax": "tax",
                "accounting": "accounting",
                "compliance": "compliance",
                "audit": "audit",
                "finalize": "finalize",
            },
        )

        for node in ["tax", "accounting", "compliance", "audit"]:
            graph.add_edge(node, "supervisor")

        graph.add_edge("finalize", END)
        return graph.compile()

    def _route(self, state: AgentState) -> str:
        return state.get("next_agent", "finalize")

    async def _supervisor_node(self, state: AgentState) -> AgentState:
        """Decide qual agente acionar baseado no contexto atual."""
        decisions = state.get("decisions", [])
        iteration = state.get("iteration", 0)

        if iteration >= 4:
            return {**state, "next_agent": "finalize"}

        completed = {d["agent_type"] for d in decisions}
        doc_type = state["document_data"].get("document_type", "other")

        # Lógica de roteamento
        if "tax" not in completed and doc_type in ("nota_fiscal", "boleto"):
            return {**state, "next_agent": "tax", "iteration": iteration + 1}
        if "accounting" not in completed:
            return {**state, "next_agent": "accounting", "iteration": iteration + 1}
        if "compliance" not in completed:
            value = state["document_data"].get("total_value", 0)
            if float(value or 0) > 1000:
                return {**state, "next_agent": "compliance", "iteration": iteration + 1}
        if "audit" not in completed and len(decisions) >= 2:
            return {**state, "next_agent": "audit", "iteration": iteration + 1}

        return {**state, "next_agent": "finalize"}

    async def _tax_node(self, state: AgentState) -> AgentState:
        decision = await tax_agent.analyze(state["document_data"], state["company_id"])
        decisions = list(state.get("decisions", []))
        decisions.append({"agent_type": "tax", **decision})
        return {**state, "decisions": decisions}

    async def _accounting_node(self, state: AgentState) -> AgentState:
        decision = await accounting_agent.analyze(
            state["document_data"],
            state["company_id"],
            state.get("decisions", []),
        )
        decisions = list(state.get("decisions", []))
        decisions.append({"agent_type": "accounting", **decision})
        return {**state, "decisions": decisions}

    async def _compliance_node(self, state: AgentState) -> AgentState:
        decision = await compliance_agent.analyze(state["document_data"], state["company_id"])
        decisions = list(state.get("decisions", []))
        decisions.append({"agent_type": "compliance", **decision})
        return {**state, "decisions": decisions}

    async def _audit_node(self, state: AgentState) -> AgentState:
        decision = await audit_agent.review(state.get("decisions", []))
        decisions = list(state.get("decisions", []))
        decisions.append({"agent_type": "audit", **decision})
        return {**state, "decisions": decisions}

    async def _finalize_node(self, state: AgentState) -> AgentState:
        """Consolida todas as decisões em resposta final."""
        decisions = state.get("decisions", [])
        summary_parts = []
        for d in decisions:
            agent = d.get("agent_type", "")
            decision_text = d.get("decision", "")
            summary_parts.append(f"[{agent.upper()}] {decision_text}")

        final = "\n\n".join(summary_parts) if summary_parts else "Análise concluída."
        return {**state, "final_answer": final}

    async def run(
        self,
        document_data: dict,
        company_id: str,
        question: str = "",
    ) -> AgentWorkflowResult:
        workflow_id = str(uuid.uuid4())
        start = time.time()
        logger.info("workflow_start", workflow_id=workflow_id, company_id=company_id)

        initial_state: AgentState = {
            "messages": [HumanMessage(content=question or json.dumps(document_data, ensure_ascii=False))],
            "document_data": document_data,
            "company_id": company_id,
            "decisions": [],
            "next_agent": "supervisor",
            "final_answer": "",
            "iteration": 0,
        }

        try:
            final_state = await self.graph.ainvoke(initial_state)
            elapsed = int((time.time() - start) * 1000)

            decisions = [
                AgentDecision(
                    agent_type=AgentType(d.get("agent_type", "supervisor")),
                    input_summary=str(document_data)[:200],
                    decision=d.get("decision", ""),
                    reasoning=d.get("reasoning", ""),
                    confidence=d.get("confidence", 0.8),
                    warnings=d.get("warnings", []),
                    recommendations=d.get("recommendations", []),
                )
                for d in final_state.get("decisions", [])
            ]

            return AgentWorkflowResult(
                workflow_id=workflow_id,
                status="completed",
                decisions=decisions,
                final_answer=final_state.get("final_answer", ""),
                processing_time_ms=elapsed,
            )
        except Exception as e:
            logger.error("workflow_failed", workflow_id=workflow_id, error=str(e))
            return AgentWorkflowResult(
                workflow_id=workflow_id,
                status="failed",
                final_answer="",
                error=str(e),
            )


supervisor_agent = SupervisorAgent()
