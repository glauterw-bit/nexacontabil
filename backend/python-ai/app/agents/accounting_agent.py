"""
Accounting Agent — Contador Sênior especialista em IFRS e legislação contábil brasileira.
"""
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.prompts.system_prompts import ACCOUNTING_SYSTEM_PROMPT
from app.prompts.accounting_prompts import SUGGEST_ACCOUNTING_ENTRIES_PROMPT
from app.services.rag_service import rag_service

logger = structlog.get_logger()


class AccountingAgent:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def analyze(
        self, document_data: dict, company_id: str, prior_decisions: list[dict]
    ) -> dict:
        """Sugere lançamentos contábeis com base no documento e histórico."""
        logger.info("accounting_agent_start", company_id=company_id)

        # Busca contexto RAG (transações similares)
        similar = await rag_service.find_similar_transactions(document_data, company_id)
        history_text = (
            "\n".join(
                f"- {s.get('description', '')} → {s.get('account_code', '')} {s.get('account_name', '')} "
                f"(R$ {s.get('total_value', 0):.2f}, relevância {s.get('score', 0):.0%})"
                for s in similar
            )
            or "Nenhum histórico encontrado"
        )

        taxes = document_data.get("taxes", [])
        taxes_summary = ", ".join(
            f"{t.get('name', '')}: R$ {t.get('value', 0):.2f}"
            for t in taxes
        ) or "Sem impostos identificados"

        prompt = SUGGEST_ACCOUNTING_ENTRIES_PROMPT.format(
            document_type=document_data.get("document_type", ""),
            issuer_name=document_data.get("issuer_name", ""),
            total_value=document_data.get("total_value", 0),
            issue_date=document_data.get("issue_date", ""),
            description=document_data.get("description", ""),
            taxes_summary=taxes_summary,
            similar_history=history_text,
        )

        messages = [
            SystemMessage(content=ACCOUNTING_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]

        try:
            response = await self.llm.ainvoke(messages)
            content = response.content

            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                import re
                json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
                result = json.loads(json_match.group(1)) if json_match else {"raw": content}

            # Valida equilíbrio das partidas
            entries = result.get("entries", [])
            total_debit = sum(e.get("value", 0) for e in entries if e.get("nature") == "debit")
            total_credit = sum(e.get("value", 0) for e in entries if e.get("nature") == "credit")
            balanced = abs(total_debit - total_credit) < 0.01

            warnings = result.get("warnings", [])
            if not balanced:
                warnings.append(
                    f"ATENÇÃO: Partidas não equilibradas! Débito: R$ {total_debit:.2f}, Crédito: R$ {total_credit:.2f}"
                )

            return {
                "decision": (
                    f"Lançamento sugerido: {result.get('description', 'Ver entries')} "
                    f"({'EQUILIBRADO' if balanced else 'DESEQUILIBRADO'})"
                ),
                "reasoning": result.get("reasoning", ""),
                "confidence": float(result.get("confidence_score", 0.85)),
                "warnings": warnings,
                "recommendations": [],
                "metadata": {
                    "entries": entries,
                    "balanced": balanced,
                    "rag_sources": len(similar),
                },
            }
        except Exception as e:
            logger.error("accounting_agent_failed", error=str(e))
            return {
                "decision": "Classificação contábil indisponível por falha técnica",
                "reasoning": str(e),
                "confidence": 0.0,
                "warnings": [f"Falha no agente contábil: {e}"],
                "recommendations": [],
                "metadata": {},
            }


accounting_agent = AccountingAgent()
