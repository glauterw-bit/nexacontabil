"""
Audit Agent — Revisor independente das decisões dos demais agentes.
"""
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.prompts.system_prompts import AUDIT_SYSTEM_PROMPT

logger = structlog.get_logger()

AUDIT_REVIEW_PROMPT = """Revise as seguintes análises realizadas pelos agentes especializados do DomoSYS:

{decisions_json}

Sua função:
1. Identifique inconsistências entre as análises
2. Valide se as recomendações são coerentes entre si
3. Questione conclusões sem fundamentação adequada
4. Consolide um parecer final

Retorne JSON:
{{
  "inconsistencies": ["lista de inconsistências encontradas"],
  "validated_recommendations": ["recomendações validadas"],
  "rejected_recommendations": ["recomendações rejeitadas e por quê"],
  "additional_findings": ["descobertas adicionais"],
  "overall_risk": "BAIXO|MÉDIO|ALTO|CRÍTICO",
  "final_opinion": "parecer final consolidado em linguagem clara",
  "confidence_in_analysis": 0.95
}}"""


class AuditAgent:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def review(self, decisions: list[dict]) -> dict:
        """Revisa e consolida as decisões dos demais agentes."""
        if not decisions:
            return {
                "decision": "Nenhuma decisão para revisar",
                "reasoning": "",
                "confidence": 1.0,
                "warnings": [],
                "recommendations": [],
                "metadata": {},
            }

        logger.info("audit_agent_start", decisions_count=len(decisions))
        decisions_json = json.dumps(decisions, ensure_ascii=False, indent=2)
        prompt = AUDIT_REVIEW_PROMPT.format(decisions_json=decisions_json)

        messages = [
            SystemMessage(content=AUDIT_SYSTEM_PROMPT),
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

            inconsistencies = result.get("inconsistencies", [])
            overall_risk = result.get("overall_risk", "BAIXO")

            return {
                "decision": f"Auditoria concluída: {overall_risk} | {len(inconsistencies)} inconsistência(s)",
                "reasoning": result.get("final_opinion", ""),
                "confidence": float(result.get("confidence_in_analysis", 0.90)),
                "warnings": inconsistencies,
                "recommendations": result.get("validated_recommendations", []),
                "metadata": {
                    "overall_risk": overall_risk,
                    "rejected_recommendations": result.get("rejected_recommendations", []),
                    "additional_findings": result.get("additional_findings", []),
                },
            }
        except Exception as e:
            logger.error("audit_agent_failed", error=str(e))
            return {
                "decision": "Auditoria inconclusiva por falha técnica",
                "reasoning": str(e),
                "confidence": 0.0,
                "warnings": ["Revisão manual do auditor recomendada"],
                "recommendations": [],
                "metadata": {},
            }


audit_agent = AuditAgent()
