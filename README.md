# Aura Accounting

**Sistema de Contabilidade com Inteligência Artificial — Padrão 2026**

> Transforma a contabilidade de um centro de custos em um centro de inteligência estratégica.

---

## O que é o Aura Accounting?

O Aura Accounting é um sistema **AIO (AI-Optimized)** que usa:

| Tecnologia | Uso |
|------------|-----|
| **GPT-4o Vision** | Extração de dados de documentos (IDP) com 99%+ de precisão |
| **LangGraph Multi-Agent** | 5 agentes autônomos colaborativos |
| **RAG (Pinecone)** | Contexto histórico para classificação contábil |
| **Fuzzy Matching** | Reconciliação automática NF + Boleto + Extrato |
| **Trilha Imutável** | Hash chain SHA-256 para auditoria blockchain-like |

---

## Estrutura do Projeto

```
NEXACONTABIL/
├── backend/
│   ├── python-ai/          # FastAPI — Motor de IA
│   │   ├── app/agents/     # 5 agentes LangGraph
│   │   ├── app/services/   # IDP, RAG, Reconciliação
│   │   └── app/routes/     # REST API endpoints
│   └── nodejs-api/         # NestJS — API de negócios
│       └── src/modules/    # Companies, Documents, Transactions, Audit
├── frontend/               # Next.js 15 — Interface
│   └── src/app/            # Dashboard, Documentos, Copilot
├── docs/                   # Documentação
└── docker-compose.yml      # Infraestrutura completa
```

---

## Inicio Rápido

```bash
# 1. Configure suas chaves de API
cp .env.example .env
# Edite .env: OPENAI_API_KEY, DATABASE_URL, JWT_SECRET

# 2. Suba tudo com Docker
docker compose up -d

# 3. Acesse
# → http://localhost:3000   (Frontend)
# → http://localhost:3001/graphql  (API GraphQL)
# → http://localhost:8000/docs     (AI Engine Swagger)
```

---

## 5 Agentes Autônomos

| Agente | Função |
|--------|--------|
| **Supervisor** | Orquestra o fluxo entre os agentes |
| **Tax Agent** | Valida SPED, NCM, CFOP, impostos brasileiros |
| **Accounting Agent** | Sugere lançamentos contábeis (partidas dobradas) |
| **Compliance Agent** | Identifica riscos, fraudes, despesas não dedutíveis |
| **Audit Agent** | Revisa decisões e gera parecer final |

---

## Documentação

- [Arquitetura](docs/ARCHITECTURE.md)
- [Setup e Instalação](docs/SETUP.md)

---

## Stack

**Backend IA**: Python 3.11 · FastAPI · LangChain · LangGraph · OpenAI GPT-4o
**Backend API**: Node.js 22 · NestJS · GraphQL · Prisma · PostgreSQL
**Frontend**: Next.js 15 · React 18 · TypeScript · TailwindCSS
**Infra**: Docker · Redis · Pinecone
