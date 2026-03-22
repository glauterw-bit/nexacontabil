"""
RAG Service — Retrieval Augmented Generation
Armazena e busca transações similares via embeddings vetoriais (Pinecone).
"""
import json
import hashlib
import structlog
from typing import List, Optional
from tenacity import retry, stop_after_attempt, wait_exponential

from openai import AsyncOpenAI
from app.config import settings

logger = structlog.get_logger()


class RAGService:
    def __init__(self):
        self.openai = AsyncOpenAI(api_key=settings.openai_api_key)
        self._index = None

    def _get_index(self):
        """Inicializa o índice Pinecone de forma lazy."""
        if self._index is None:
            try:
                from pinecone import Pinecone
                pc = Pinecone(api_key=settings.pinecone_api_key)
                self._index = pc.Index(settings.pinecone_index_name)
            except Exception as e:
                logger.warning("pinecone_unavailable", error=str(e))
                self._index = None
        return self._index

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=5))
    async def _embed(self, text: str) -> List[float]:
        """Gera embedding via OpenAI text-embedding-3-small."""
        response = await self.openai.embeddings.create(
            model="text-embedding-3-small",
            input=text[:8000],
        )
        return response.data[0].embedding

    def _build_transaction_text(self, transaction: dict) -> str:
        """Converte transação em texto para embedding."""
        parts = []
        if transaction.get("issuer_name"):
            parts.append(f"Fornecedor: {transaction['issuer_name']}")
        if transaction.get("description"):
            parts.append(f"Descrição: {transaction['description']}")
        if transaction.get("total_value"):
            parts.append(f"Valor: {transaction['total_value']}")
        if transaction.get("document_type"):
            parts.append(f"Tipo: {transaction['document_type']}")
        if transaction.get("account_code"):
            parts.append(f"Conta: {transaction['account_code']} - {transaction.get('account_name', '')}")
        return " | ".join(parts)

    async def store_transaction(
        self,
        transaction_id: str,
        company_id: str,
        transaction_data: dict,
    ) -> bool:
        """Armazena uma transação no Vector DB para uso futuro em RAG."""
        index = self._get_index()
        if not index:
            logger.warning("pinecone_skip_store", reason="index_unavailable")
            return False

        try:
            text = self._build_transaction_text(transaction_data)
            embedding = await self._embed(text)
            doc_hash = hashlib.md5(text.encode()).hexdigest()[:8]
            vector_id = f"{company_id}_{transaction_id}_{doc_hash}"

            metadata = {
                "company_id": company_id,
                "transaction_id": transaction_id,
                "issuer_name": transaction_data.get("issuer_name", ""),
                "document_type": transaction_data.get("document_type", ""),
                "total_value": float(transaction_data.get("total_value", 0)),
                "account_code": transaction_data.get("account_code", ""),
                "account_name": transaction_data.get("account_name", ""),
                "description": transaction_data.get("description", "")[:500],
            }

            index.upsert(vectors=[(vector_id, embedding, metadata)])
            logger.info("rag_stored", vector_id=vector_id, company_id=company_id)
            return True
        except Exception as e:
            logger.error("rag_store_failed", error=str(e))
            return False

    async def find_similar_transactions(
        self,
        query: dict,
        company_id: str,
        top_k: int = 5,
        min_score: float = 0.7,
    ) -> List[dict]:
        """Busca transações similares para contexto RAG."""
        index = self._get_index()
        if not index:
            return []

        try:
            text = self._build_transaction_text(query)
            embedding = await self._embed(text)

            results = index.query(
                vector=embedding,
                top_k=top_k,
                filter={"company_id": {"$eq": company_id}},
                include_metadata=True,
            )

            similar = []
            for match in results.matches:
                if match.score >= min_score:
                    similar.append({
                        "score": round(match.score, 3),
                        **match.metadata,
                    })

            logger.info("rag_search_complete", found=len(similar), company_id=company_id)
            return similar
        except Exception as e:
            logger.error("rag_search_failed", error=str(e))
            return []

    async def query_knowledge_base(
        self,
        question: str,
        company_id: str,
        top_k: int = 5,
    ) -> str:
        """Busca contexto relevante para o Copilot."""
        similar = await self.find_similar_transactions(
            {"description": question},
            company_id,
            top_k=top_k,
            min_score=0.6,
        )
        if not similar:
            return "Nenhum histórico relevante encontrado."

        lines = []
        for i, tx in enumerate(similar, 1):
            lines.append(
                f"{i}. {tx.get('description', '')} | "
                f"Conta: {tx.get('account_code', '')} - {tx.get('account_name', '')} | "
                f"Valor: R$ {tx.get('total_value', 0):.2f} | "
                f"Relevância: {tx.get('score', 0):.0%}"
            )
        return "\n".join(lines)


rag_service = RAGService()
