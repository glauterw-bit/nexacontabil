"""
Reconciliation Service — Motor de Reconciliação Autônoma
Faz matching entre NF + Boleto + Extrato usando fuzzy matching + embeddings.
"""
import structlog
from typing import List, Tuple
from datetime import datetime, timedelta

from rapidfuzz import fuzz, process
from app.models.transaction import ReconciliationMatch, ReconciliationResult
from app.services.rag_service import rag_service

logger = structlog.get_logger()


def _normalize_cnpj(cnpj: str) -> str:
    return "".join(filter(str.isdigit, cnpj or ""))


def _normalize_value(value: float) -> int:
    """Converte valor para centavos para comparação exata."""
    return round(value * 100)


def _parse_date(date_str: str) -> datetime | None:
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(date_str.strip(), fmt)
        except (ValueError, AttributeError):
            continue
    return None


class ReconciliationService:
    # Tolerâncias
    VALUE_TOLERANCE_CENTS = 100  # R$ 1,00
    DATE_TOLERANCE_DAYS = 5
    NAME_SIMILARITY_THRESHOLD = 75  # rapidfuzz score 0-100

    def _compute_name_similarity(self, name_a: str, name_b: str) -> float:
        """Similaridade entre nomes de fornecedores (0.0 - 1.0)."""
        if not name_a or not name_b:
            return 0.0
        score = fuzz.token_sort_ratio(
            name_a.upper().strip(),
            name_b.upper().strip(),
        )
        return score / 100.0

    def _values_match(self, val_a: float, val_b: float) -> bool:
        return abs(_normalize_value(val_a) - _normalize_value(val_b)) <= self.VALUE_TOLERANCE_CENTS

    def _dates_match(self, date_a: str, date_b: str) -> Tuple[bool, int]:
        """Retorna (match, diferença em dias)."""
        d_a = _parse_date(date_a)
        d_b = _parse_date(date_b)
        if not d_a or not d_b:
            return False, 999
        diff = abs((d_a - d_b).days)
        return diff <= self.DATE_TOLERANCE_DAYS, diff

    def _compute_confidence(
        self,
        name_sim: float,
        value_match: bool,
        date_match: bool,
        cnpj_match: bool,
    ) -> float:
        """Score ponderado de confiança do match."""
        score = 0.0
        score += name_sim * 0.35        # 35% — nome do fornecedor
        score += (1.0 if value_match else 0.0) * 0.40   # 40% — valor
        score += (1.0 if date_match else 0.0) * 0.15    # 15% — data
        score += (1.0 if cnpj_match else 0.0) * 0.10    # 10% — CNPJ
        return round(score, 3)

    async def reconcile(
        self,
        sources: List[dict],   # Notas Fiscais / Boletos
        targets: List[dict],   # Extratos bancários / Boletos
        match_type: str = "nf_boleto",
    ) -> ReconciliationResult:
        """
        Reconcilia duas listas de documentos financeiros.
        match_type: "nf_boleto" | "boleto_extrato" | "nf_extrato"
        """
        logger.info("reconciliation_start", sources=len(sources), targets=len(targets), type=match_type)
        matched_source_ids = set()
        matched_target_ids = set()
        matches: List[ReconciliationMatch] = []

        for source in sources:
            best_match: ReconciliationMatch | None = None
            best_confidence = 0.0

            for target in targets:
                if target.get("id") in matched_target_ids:
                    continue

                # Similaridade de nome
                name_sim = self._compute_name_similarity(
                    source.get("issuer_name", "") or source.get("name", ""),
                    target.get("description", "") or target.get("name", ""),
                )

                # Match de valor
                src_val = float(source.get("total_value") or source.get("value") or 0)
                tgt_val = float(target.get("total_value") or target.get("value") or 0)
                value_match = self._values_match(src_val, tgt_val)

                # Match de data
                date_match, date_diff = self._dates_match(
                    source.get("due_date") or source.get("issue_date", ""),
                    target.get("date") or target.get("due_date", ""),
                )

                # Match de CNPJ
                src_cnpj = _normalize_cnpj(source.get("issuer_cnpj", ""))
                tgt_cnpj = _normalize_cnpj(target.get("cnpj", ""))
                cnpj_match = bool(src_cnpj and tgt_cnpj and src_cnpj == tgt_cnpj)

                confidence = self._compute_confidence(name_sim, value_match, date_match, cnpj_match)

                if confidence > best_confidence and confidence >= 0.5:
                    discrepancies = []
                    if not value_match:
                        discrepancies.append(
                            f"Valores diferem: R$ {src_val:.2f} vs R$ {tgt_val:.2f}"
                        )
                    if not date_match:
                        discrepancies.append(f"Datas diferem em {date_diff} dias")
                    if not cnpj_match and src_cnpj and tgt_cnpj:
                        discrepancies.append("CNPJs divergentes")

                    best_confidence = confidence
                    best_match = ReconciliationMatch(
                        source_id=source.get("id", ""),
                        target_id=target.get("id", ""),
                        match_type=match_type,
                        confidence_score=confidence,
                        value_match=value_match,
                        date_difference_days=date_diff if not date_match else 0,
                        description_similarity=name_sim,
                        discrepancies=discrepancies,
                    )

            if best_match:
                matches.append(best_match)
                matched_source_ids.add(best_match.source_id)
                matched_target_ids.add(best_match.target_id)

        unmatched_sources = [s["id"] for s in sources if s.get("id") not in matched_source_ids]
        unmatched_targets = [t["id"] for t in targets if t.get("id") not in matched_target_ids]

        total_matched = sum(
            float(s.get("total_value") or s.get("value") or 0)
            for s in sources
            if s.get("id") in matched_source_ids
        )
        total_unmatched = sum(
            float(s.get("total_value") or s.get("value") or 0)
            for s in sources
            if s.get("id") not in matched_source_ids
        )

        logger.info(
            "reconciliation_complete",
            matched=len(matches),
            unmatched_src=len(unmatched_sources),
            unmatched_tgt=len(unmatched_targets),
        )

        return ReconciliationResult(
            matches=matches,
            unmatched_sources=unmatched_sources,
            unmatched_targets=unmatched_targets,
            total_matched_value=round(total_matched, 2),
            total_unmatched_value=round(total_unmatched, 2),
        )


reconciliation_service = ReconciliationService()
