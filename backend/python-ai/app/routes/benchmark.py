"""
Benchmark Setorial — comparação com médias do setor.
"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
import anthropic
from app.config import settings

router = APIRouter(prefix="/benchmark", tags=["Benchmark"])

# Dados de referência por setor (CNAE simplificado)
SECTOR_DATA = {
    "comercio": {
        "name": "Comércio Varejista",
        "avg_gross_margin": 28.5,
        "avg_net_margin": 3.2,
        "avg_ebitda": 5.1,
        "avg_liquidity": 1.35,
        "avg_debt_ratio": 42.0,
        "avg_payroll_pct": 12.0,
        "avg_tax_burden": 8.5,
    },
    "servicos": {
        "name": "Serviços",
        "avg_gross_margin": 52.0,
        "avg_net_margin": 8.5,
        "avg_ebitda": 14.2,
        "avg_liquidity": 1.80,
        "avg_debt_ratio": 28.0,
        "avg_payroll_pct": 35.0,
        "avg_tax_burden": 14.2,
    },
    "industria": {
        "name": "Indústria",
        "avg_gross_margin": 35.0,
        "avg_net_margin": 5.2,
        "avg_ebitda": 9.8,
        "avg_liquidity": 1.55,
        "avg_debt_ratio": 48.0,
        "avg_payroll_pct": 22.0,
        "avg_tax_burden": 11.8,
    },
    "construcao": {
        "name": "Construção Civil",
        "avg_gross_margin": 22.0,
        "avg_net_margin": 4.1,
        "avg_ebitda": 7.5,
        "avg_liquidity": 1.25,
        "avg_debt_ratio": 55.0,
        "avg_payroll_pct": 28.0,
        "avg_tax_burden": 9.2,
    },
    "saude": {
        "name": "Saúde e Bem-Estar",
        "avg_gross_margin": 45.0,
        "avg_net_margin": 9.0,
        "avg_ebitda": 16.5,
        "avg_liquidity": 1.90,
        "avg_debt_ratio": 25.0,
        "avg_payroll_pct": 42.0,
        "avg_tax_burden": 13.5,
    },
    "tecnologia": {
        "name": "Tecnologia da Informação",
        "avg_gross_margin": 68.0,
        "avg_net_margin": 15.0,
        "avg_ebitda": 22.0,
        "avg_liquidity": 2.20,
        "avg_debt_ratio": 18.0,
        "avg_payroll_pct": 48.0,
        "avg_tax_burden": 16.0,
    },
    "alimentacao": {
        "name": "Alimentação e Bebidas",
        "avg_gross_margin": 32.0,
        "avg_net_margin": 4.5,
        "avg_ebitda": 8.2,
        "avg_liquidity": 1.20,
        "avg_debt_ratio": 45.0,
        "avg_payroll_pct": 25.0,
        "avg_tax_burden": 10.5,
    },
}

class BenchmarkRequest(BaseModel):
    company_id: str
    sector: str  # "comercio" | "servicos" | "industria" | "construcao" | "saude" | "tecnologia" | "alimentacao"
    company_gross_margin: float
    company_net_margin: float
    company_ebitda: float
    company_liquidity: float
    company_debt_ratio: float
    company_payroll_pct: float
    company_tax_burden: float

@router.post("/analyze")
async def analyze_benchmark(req: BenchmarkRequest):
    """Compara empresa com benchmark setorial."""
    sector = SECTOR_DATA.get(req.sector, SECTOR_DATA["servicos"])

    def compare(company_val: float, sector_val: float, higher_is_better: bool = True) -> dict:
        diff = company_val - sector_val
        pct = (diff / sector_val * 100) if sector_val != 0 else 0
        if higher_is_better:
            status = "acima" if diff > 0 else "abaixo"
            performance = "positivo" if diff > 0 else "negativo"
        else:
            status = "abaixo" if diff > 0 else "acima"
            performance = "negativo" if diff > 0 else "positivo"
        return {
            "company": round(company_val, 1),
            "sector_avg": round(sector_val, 1),
            "diff": round(diff, 1),
            "diff_pct": round(pct, 1),
            "status": status,
            "performance": performance,
        }

    comparison = {
        "gross_margin": compare(req.company_gross_margin, sector["avg_gross_margin"]),
        "net_margin": compare(req.company_net_margin, sector["avg_net_margin"]),
        "ebitda": compare(req.company_ebitda, sector["avg_ebitda"]),
        "liquidity": compare(req.company_liquidity, sector["avg_liquidity"]),
        "debt_ratio": compare(req.company_debt_ratio, sector["avg_debt_ratio"], higher_is_better=False),
        "payroll_pct": compare(req.company_payroll_pct, sector["avg_payroll_pct"]),
        "tax_burden": compare(req.company_tax_burden, sector["avg_tax_burden"], higher_is_better=False),
    }

    # Overall score
    positives = sum(1 for v in comparison.values() if v["performance"] == "positivo")
    total_metrics = len(comparison)
    benchmark_score = round(positives / total_metrics * 100)

    client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.anthropic_model,
        messages=[{"role": "user", "content": f"""Compare esta empresa com o benchmark do setor {sector['name']}:

Margem Bruta: empresa {req.company_gross_margin}% vs setor {sector['avg_gross_margin']}%
Margem Líquida: empresa {req.company_net_margin}% vs setor {sector['avg_net_margin']}%
EBITDA: empresa {req.company_ebitda}% vs setor {sector['avg_ebitda']}%
Liquidez: empresa {req.company_liquidity} vs setor {sector['avg_liquidity']}
Endividamento: empresa {req.company_debt_ratio}% vs setor {sector['avg_debt_ratio']}%
Folha/Receita: empresa {req.company_payroll_pct}% vs setor {sector['avg_payroll_pct']}%
Carga Tributária: empresa {req.company_tax_burden}% vs setor {sector['avg_tax_burden']}%

Score: {benchmark_score}/100 — empresa está acima do setor em {positives}/{total_metrics} métricas.

Dê insights e recomendações específicas para melhorar os indicadores abaixo da média."""}],
        max_tokens=600,
    )

    return {
        "company_id": req.company_id,
        "sector": req.sector,
        "sector_name": sector["name"],
        "benchmark_score": benchmark_score,
        "comparison": comparison,
        "strengths": [k for k, v in comparison.items() if v["performance"] == "positivo"],
        "weaknesses": [k for k, v in comparison.items() if v["performance"] == "negativo"],
        "ai_analysis": response.content[0].text,
    }

@router.get("/sectors")
async def list_sectors():
    """Lista setores disponíveis para benchmark."""
    return [{"key": k, "name": v["name"]} for k, v in SECTOR_DATA.items()]
