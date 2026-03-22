"""
Tax Agent — Auditor Fiscal com expertise em legislação tributária brasileira.
"""
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.prompts.system_prompts import TAX_SYSTEM_PROMPT
from app.prompts.tax_prompts import ANALYZE_NF_PROMPT

logger = structlog.get_logger()


class TaxAgent:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def analyze(self, document_data: dict, company_id: str) -> dict:
        """Analisa aspectos fiscais de um documento."""
        logger.info("tax_agent_start", company_id=company_id)

        doc_json = json.dumps(document_data, ensure_ascii=False, indent=2)
        prompt = ANALYZE_NF_PROMPT.format(document_data=doc_json)

        messages = [
            SystemMessage(content=TAX_SYSTEM_PROMPT),
            HumanMessage(content=prompt),
        ]

        try:
            response = await self.llm.ainvoke(messages)
            content = response.content

            # Tenta parsear JSON da resposta
            try:
                result = json.loads(content)
            except json.JSONDecodeError:
                # Extrai JSON do markdown se necessário
                import re
                json_match = re.search(r"```json\s*(.*?)\s*```", content, re.DOTALL)
                if json_match:
                    result = json.loads(json_match.group(1))
                else:
                    result = {"raw_response": content}

            return {
                "decision": f"Análise fiscal: {'APROVADO' if result.get('valid') else 'PENDÊNCIAS ENCONTRADAS'}",
                "reasoning": json.dumps(result, ensure_ascii=False),
                "confidence": 0.92,
                "warnings": result.get("issues", []) + result.get("warnings", []),
                "recommendations": result.get("optimizations", []),
                "metadata": {
                    "risk_level": result.get("risk_level", "BAIXO"),
                    "ncm_valid": result.get("ncm_valid"),
                    "cfop_valid": result.get("cfop_valid"),
                    "sped_classification": result.get("sped_classification", {}),
                },
            }
        except Exception as e:
            logger.error("tax_agent_failed", error=str(e))
            return {
                "decision": "Análise fiscal inconclusiva por falha técnica",
                "reasoning": str(e),
                "confidence": 0.0,
                "warnings": [f"Falha na análise fiscal: {e}"],
                "recommendations": [],
                "metadata": {},
            }


tax_agent = TaxAgent()
