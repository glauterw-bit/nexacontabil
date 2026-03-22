"""
Aura Accounting — Python AI Service
FastAPI app: IDP, Multi-Agent System, RAG, Reconciliation
"""
import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routes import documents, agents, transactions

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("aura_ai_starting", version="1.0.0")
    yield
    logger.info("aura_ai_shutdown")


app = FastAPI(
    title="Aura Accounting — AI Engine",
    description="Motor de IA para processamento inteligente de documentos e agentes autônomos",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api/v1")
app.include_router(agents.router, prefix="/api/v1")
app.include_router(transactions.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aura-ai", "version": "1.0.0"}


@app.get("/")
async def root():
    return {
        "service": "Aura Accounting AI Engine",
        "version": "1.0.0",
        "docs": "/docs",
        "endpoints": {
            "idp": "/api/v1/documents/upload",
            "copilot": "/api/v1/agents/copilot",
            "reconciliation": "/api/v1/transactions/reconcile",
        },
    }
