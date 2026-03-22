# Setup e Instalação

## Pré-requisitos
- Docker Desktop (Windows/Mac/Linux)
- Node.js 22+ (desenvolvimento local)
- Python 3.11+ (desenvolvimento local)
- Conta OpenAI com acesso ao GPT-4o
- Conta Pinecone (plano free funciona para testes)

## Setup Rápido (Docker)

```bash
# 1. Clone / entre no projeto
cd NEXACONTABIL

# 2. Configure variáveis de ambiente
cp .env.example .env
# Edite .env com suas chaves de API

# 3. Suba todos os serviços
docker compose up -d

# 4. Execute as migrations do banco
docker compose exec nodejs-api npm run db:migrate

# 5. Acesse o sistema
# Frontend:    http://localhost:3000
# API GraphQL: http://localhost:3001/graphql
# AI Engine:   http://localhost:8000/docs
```

## Setup Local (Desenvolvimento)

### Backend Python AI

```bash
cd backend/python-ai

# Criar ambiente virtual
python -m venv .venv
source .venv/bin/activate  # Linux/Mac
# ou .venv\Scripts\activate  # Windows

# Instalar dependências
pip install -r requirements.txt

# Configurar .env
cp ../../.env.example .env
# Edite com suas chaves

# Rodar
uvicorn main:app --reload --port 8000
```

### Backend Node.js

```bash
cd backend/nodejs-api

npm install

# Gerar cliente Prisma
npx prisma generate

# Aplicar migrations
npx prisma db push

# Rodar em desenvolvimento
npm run start:dev
```

### Frontend

```bash
cd frontend

npm install

npm run dev
# Acesse http://localhost:3000
```

## Variáveis Obrigatórias

| Variável | Descrição |
|----------|-----------|
| `OPENAI_API_KEY` | Chave da API OpenAI (GPT-4o) |
| `DATABASE_URL` | URL do PostgreSQL |
| `JWT_SECRET` | Segredo para tokens JWT |

## Variáveis Opcionais (mas recomendadas)

| Variável | Descrição |
|----------|-----------|
| `ANTHROPIC_API_KEY` | Fallback LLM (Claude) |
| `PINECONE_API_KEY` | Vector DB para RAG |
| `AWS_ACCESS_KEY_ID` | Armazenamento S3 |
