ANALYZE_NF_PROMPT = """Analise a Nota Fiscal abaixo e valide todos os aspectos fiscais:

{document_data}

Retorne um JSON com a seguinte estrutura:
{{
  "valid": true/false,
  "ncm_valid": true/false,
  "cfop_valid": true/false,
  "tax_rates_valid": true/false,
  "issues": ["lista de problemas encontrados"],
  "warnings": ["lista de alertas"],
  "optimizations": ["sugestões de otimização tributária"],
  "risk_level": "BAIXO|MÉDIO|ALTO|CRÍTICO",
  "risk_reasoning": "explicação do risco",
  "sped_classification": {{
    "registro": "C100/D100/etc",
    "cst_icms": "000",
    "cst_pis_cofins": "01"
  }}
}}"""

VALIDATE_TAXES_PROMPT = """Dados os seguintes valores declarados na nota fiscal:

Valor Total: R$ {total_value}
ICMS declarado: R$ {icms_value} ({icms_rate}%)
PIS declarado: R$ {pis_value} ({pis_rate}%)
COFINS declarado: R$ {cofins_value} ({cofins_rate}%)
IPI declarado: R$ {ipi_value}
CFOP: {cfop}
NCM: {ncm}
Estado emitente: {state}
Regime tributário: {tax_regime}

Valide se os impostos estão corretos conforme a legislação vigente.
Retorne JSON com: valid (bool), calculated_values (objeto), discrepancies (lista), explanation (string)."""

SPED_CLASSIFICATION_PROMPT = """Com base nos dados da nota fiscal abaixo, forneça a classificação completa para escrituração no SPED Fiscal:

{document_summary}

Retorne JSON com:
{{
  "registro_principal": "C100 ou D100",
  "cfop": "código CFOP",
  "cst_icms": "código CST",
  "cst_pis": "código CST",
  "cst_cofins": "código CST",
  "natureza_operacao": "descrição",
  "observacoes": "observações para o contador"
}}"""
