"""
Compliance Agent — Especialista em compliance, auditoria interna e prevenção a fraudes.
"""
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

from app.config import settings
from app.prompts.system_prompts import COMPLIANCE_SYSTEM_PROMPT

logger = structlog.get_logger()

COMPLIANCE_ANALYSIS_PROMPT = """Analise o documento abaixo sob a perspectiva de compliance, riscos e possíveis irregularidades:

{document_json}

Verifique especificamente:
1. A despesa é dedutível para fins de IRPJ/CSLL? (art. 13 Lei 9.249/95)
2. Existem indícios de fraude (valores redondos, fornecedor novo com valor alto)?
3. O valor está dentro de limites razoáveis para o tipo de despesa?
4. Existem dados de fornecedor suspeitos (CNPJ inválido, sem endereço)?
5. A operação pode ser configurada como despesa com partes relacionadas?

Retorne JSON:
{{
  "risk_level": "BAIXO|MÉDIO|ALTO|CRÍTICO",
  "is_deductible": true/false,
  "deductibility_reasoning": "explicação",
  "fraud_indicators": ["lista de indicadores"],
  "policy_violations": ["violações de política"],
  "requires_approval": true/false,
  "approval_level": "gerente|diretor|board",
  "recommended_actions": ["ações recomendadas"],
  "overall_assessment": "texto resumido da avaliação"
}}"""


class ComplianceAgent:
    def __init__(self):
        self.llm = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=0,
        )

    def _pre_check_fraud_signals(self, document_data: dict) -> list[str]:
        """Verificações heurísticas rápidas antes de chamar o LLM."""
        signals = []
        value = float(document_data.get("total_value") or 0)

        # Valor redondo suspeito
        if value > 1000 and value == round(value, -2):
            signals.append(f"Valor redondo de R$ {value:,.2f} pode indicar estimativa")

        # Valor muito alto sem itens detalhados
        items = document_data.get("line_items", [])
        if value > 50000 and not items:
            signals.append("Valor alto sem itens detalhados na nota")

        # CNPJ ausente em NF de valor alto
        if value > 5000 and not document_data.get("issuer_cnpj"):
            signals.append("CNPJ do emitente ausente em operação de alto valor")

        return signals

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def analyze(self, document_data: dict, company_id: str) -> dict:
        """Análise de compliance e riscos."""
        logger.info("compliance_agent_start", company_id=company_id)

        pre_signals = self._pre_check_fraud_signals(document_data)
        doc_json = json.dumps(document_data, ensure_ascii=False, indent=2)
        prompt = COMPLIANCE_ANALYSIS_PROMPT.format(document_json=doc_json)

        messages = [
            SystemMessage(content=COMPLIANCE_SYSTEM_PROMPT),
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

            risk = result.get("risk_level", "BAIXO")
            fraud_indicators = result.get("fraud_indicators", []) + pre_signals
            confidence = {"BAIXO": 0.95, "MÉDIO": 0.85, "ALTO": 0.75, "CRÍTICO": 0.70}.get(risk, 0.80)

            return {
                "decision": f"Compliance: Risco {risk} | {'Dedutível' if result.get('is_deductible') else 'NÃO dedutível'}",
                "reasoning": result.get("overall_assessment", ""),
                "confidence": confidence,
                "warnings": fraud_indicators + result.get("policy_violations", []),
                "recommendations": result.get("recommended_actions", []),
                "metadata": {
                    "risk_level": risk,
                    "is_deductible": result.get("is_deductible"),
                    "requires_approval": result.get("requires_approval"),
                    "approval_level": result.get("approval_level"),
                },
            }
        except Exception as e:
            logger.error("compliance_agent_failed", error=str(e))
            return {
                "decision": "Análise de compliance indisponível",
                "reasoning": str(e),
                "confidence": 0.0,
                "warnings": ["Falha na análise de compliance — revisão manual necessária"],
                "recommendations": [],
                "metadata": {},
            }


compliance_agent = ComplianceAgent()
