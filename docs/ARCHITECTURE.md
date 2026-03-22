# Aura Accounting — Arquitetura do Sistema

## Visão Geral

O Aura Accounting é um sistema de contabilidade com IA (AIO — AI-Optimized) que transforma a contabilidade em um centro de inteligência estratégica.

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                  │
│  Dashboard · Documentos · Transações · Copilot · Config  │
└──────────────────┬────────────────┬──────────────────────┘
                   │ GraphQL        │ REST
                   ▼                ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│  Node.js API         │   │  Python AI Engine (FastAPI)   │
│  (NestJS + Prisma)   │   │                               │
│  - Companies         │   │  ┌─────────────────────────┐  │
│  - Documents         │   │  │  IDP Pipeline           │  │
│  - Transactions      │◄──┤  │  GPT-4o Vision + OCR    │  │
│  - Reconciliation    │   │  └─────────────────────────┘  │
│  - Audit Trail       │   │  ┌─────────────────────────┐  │
└──────────┬───────────┘   │  │  Multi-Agent System     │  │
           │               │  │  LangGraph + LangChain  │  │
           ▼               │  │  Supervisor → Agents    │  │
┌──────────────────┐       │  └─────────────────────────┘  │
│  PostgreSQL 16   │       │  ┌─────────────────────────┐  │
│  - Empresas      │       │  │  RAG Service            │  │
│  - Documentos    │       │  │  Pinecone + Embeddings  │  │
│  - Transações    │       │  └─────────────────────────┘  │
│  - Audit Trail   │       │  ┌─────────────────────────┐  │
└──────────────────┘       │  │  Reconciliation Engine  │  │
                           │  │  Fuzzy + Semantic Match │  │
┌──────────────────┐       │  └─────────────────────────┘  │
│  Redis 7         │       └──────────────────────────────┘
│  - Cache         │
│  - Filas         │
└──────────────────┘
```

## Componentes Principais

### IDP Pipeline (Intelligent Document Processing)
- **Input**: JPEG, PNG, PDF, WebP, TIFF
- **Processamento**: GPT-4o Vision API → Extração JSON estruturado
- **Fallback**: Tesseract OCR → GPT-4o Texto
- **Output**: `ExtractedDocumentData` com 99%+ de precisão

### Multi-Agent System (LangGraph)
```
Supervisor Agent
├── Tax Agent        → Valida SPED, NCM, CFOP, impostos
├── Accounting Agent → Sugere partidas dobradas via RAG
├── Compliance Agent → Identifica riscos e fraudes
└── Audit Agent      → Revisa e consolida decisões
```

### Motor de Reconciliação
- **Algoritmo**: Fuzzy matching (rapidfuzz) + embeddings vetoriais
- **Score ponderado**: 40% valor + 35% nome + 15% data + 10% CNPJ
- **Match types**: NF↔Boleto, Boleto↔Extrato, NF↔Extrato

### Trilha de Auditoria Imutável
- Hash chain SHA-256 (blockchain-like)
- Cada registro aponta para o hash do anterior
- Verificação de integridade disponível via GraphQL

## APIs

### Python AI Engine (porta 8000)
| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/api/v1/documents/upload` | Upload + processamento IDP + agentes |
| POST | `/api/v1/documents/extract-only` | Só extração IDP |
| POST | `/api/v1/agents/copilot` | Chat com Copilot financeiro |
| POST | `/api/v1/agents/analyze` | Análise multi-agente de dados |
| POST | `/api/v1/transactions/reconcile` | Reconciliação automática |

### Node.js API — GraphQL (porta 3001)
Playground disponível em `/graphql` em modo desenvolvimento.

**Queries**: `companies`, `company`, `documents`, `document`, `documentStats`, `transactions`, `transaction`, `reconciliationHistory`, `auditTrail`, `verifyAuditIntegrity`

**Mutations**: `createCompany`, `deactivateCompany`, `updateDocumentStatus`, `createTransaction`, `approveTransaction`, `rejectTransaction`, `runReconciliation`

## Segurança
- JWT para autenticação
- RBAC: admin, accountant, manager, user
- Rate limiting: 100 req/min por IP
- Trilha de auditoria imutável para todas as ações
- Variáveis sensíveis apenas em `.env` (nunca commitadas)
