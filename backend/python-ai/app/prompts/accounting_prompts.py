SUGGEST_ACCOUNTING_ENTRIES_PROMPT = """Com base no documento abaixo, sugira os lançamentos contábeis corretos:

Tipo de Documento: {document_type}
Fornecedor/Emitente: {issuer_name}
Valor Total: R$ {total_value}
Data: {issue_date}
Descrição: {description}
Impostos: {taxes_summary}
Histórico da empresa (transações similares): {similar_history}

Retorne um JSON com:
{{
  "confidence_score": 0.95,
  "description": "Histórico do lançamento",
  "reasoning": "Justificativa da classificação",
  "entries": [
    {{
      "account_code": "3.1.1.01",
      "account_name": "Despesas com Fornecedores",
      "nature": "debit",
      "value": 1000.00,
      "cost_center": "CC001",
      "description": "Descrição do débito"
    }},
    {{
      "account_code": "2.1.1.01",
      "account_name": "Fornecedores a Pagar",
      "nature": "credit",
      "value": 1000.00,
      "description": "Descrição do crédito"
    }}
  ],
  "warnings": ["lista de alertas"],
  "alternative_classifications": []
}}

IMPORTANTE: A soma dos débitos deve ser igual à soma dos créditos."""

CLASSIFY_EXPENSE_PROMPT = """Classifique a despesa abaixo no plano de contas:

Descrição: {description}
Fornecedor: {supplier}
Valor: R$ {value}
Departamento solicitante: {department}

Categorias disponíveis:
- Despesas Operacionais (3.1.x)
- Despesas Administrativas (3.2.x)
- Despesas Comerciais (3.3.x)
- Despesas Financeiras (3.4.x)
- Custos dos Produtos/Serviços (4.1.x)

Retorne JSON: {{classification, account_code, account_name, reasoning, confidence}}"""

RAG_CONTEXT_PROMPT = """Contexto de transações similares encontradas no histórico da empresa:

{context}

Com base nesse contexto histórico e no documento atual:
{document}

Sugira o lançamento contábil mais adequado, priorizando o padrão histórico da empresa quando aplicável."""
