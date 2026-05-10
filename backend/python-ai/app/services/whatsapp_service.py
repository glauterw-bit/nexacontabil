"""
WhatsApp Service — Gerencia estado das conversas e comunica com a Evolution API.
"""
import asyncio
import base64
import json
import random
import httpx
import structlog
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict

from app.config import settings
from app.models.whatsapp import (
    ConversationState,
    ConversationStage,
    ConversationMessage,
    MessageType,
    IncomingMessage,
)
from app.agents.whatsapp_agent import whatsapp_agent

logger = structlog.get_logger()

# ─── Persistência de conversas ────────────────────────────────────────────────
_CONV_FILE = Path(__file__).parent.parent.parent / "conversations.json"
CONVERSATION_TTL_HOURS = 24

_conversations: Dict[str, ConversationState] = {}
_last_activity: Dict[str, datetime] = {}


def _load_conversations() -> None:
    """Carrega conversas do disco na inicialização."""
    try:
        if _CONV_FILE.exists():
            data = json.loads(_CONV_FILE.read_text(encoding="utf-8"))
            cutoff = datetime.utcnow() - timedelta(hours=CONVERSATION_TTL_HOURS)
            for key, raw in data.items():
                try:
                    state = ConversationState.model_validate(raw)
                    if state.updated_at > cutoff:
                        _conversations[key] = state
                        _last_activity[key] = state.updated_at
                except Exception:
                    pass
            logger.info("conversations_loaded", count=len(_conversations))
    except Exception as e:
        logger.warning("conversations_load_failed", error=str(e))


def _persist_conversations() -> None:
    """Salva conversas no disco."""
    try:
        data = {k: v.model_dump(mode="json") for k, v in _conversations.items()}
        _CONV_FILE.write_text(json.dumps(data, ensure_ascii=False, default=str), encoding="utf-8")
    except Exception as e:
        logger.warning("conversations_persist_failed", error=str(e))


# Carrega ao importar o módulo
_load_conversations()


def _conv_key(instance: str, phone: str) -> str:
    return f"{instance}:{phone}"


def get_conversation(instance: str, phone: str, company_id: str) -> ConversationState:
    key = _conv_key(instance, phone)
    if key not in _conversations:
        _conversations[key] = ConversationState(
            phone=phone,
            company_id=company_id,
            instance_name=instance,
        )
    _last_activity[key] = datetime.utcnow()
    return _conversations[key]


def save_conversation(state: ConversationState) -> None:
    key = _conv_key(state.instance_name, state.phone)
    state.updated_at = datetime.utcnow()
    _conversations[key] = state
    _last_activity[key] = datetime.utcnow()
    _persist_conversations()


def clear_stale_conversations() -> int:
    cutoff = datetime.utcnow() - timedelta(hours=CONVERSATION_TTL_HOURS)
    stale = [k for k, t in _last_activity.items() if t < cutoff]
    for k in stale:
        _conversations.pop(k, None)
        _last_activity.pop(k, None)
    _persist_conversations()
    return len(stale)


def list_conversations(company_id: str) -> list[dict]:
    result = []
    for key, state in _conversations.items():
        if state.company_id != company_id:
            continue
        result.append({
            "phone": state.phone.split("@")[0],
            "phone_jid": state.phone,
            "instance": state.instance_name,
            "stage": state.stage.value,
            "client_name": state.client_name,
            "client_cnpj": state.client_cnpj,
            "messages": len(state.messages),
            "docs": len(state.collected_docs),
            "updated_at": state.updated_at.isoformat(),
        })
    return sorted(result, key=lambda x: x["updated_at"], reverse=True)


# ─── Evolution API Client ─────────────────────────────────────────────────────
class EvolutionAPIClient:
    def __init__(self):
        self.base_url = settings.evolution_api_url.rstrip("/")
        self.api_key = settings.evolution_api_key

    def _headers(self) -> dict:
        return {
            "apikey": self.api_key,
            "Content-Type": "application/json",
        }

    def _instance_url(self, instance: str) -> str:
        from urllib.parse import quote
        return quote(instance, safe="")

    async def send_text(self, instance: str, phone: str, text: str) -> bool:
        url = f"{self.base_url}/message/sendText/{self._instance_url(instance)}"
        payload = {
            "number": phone,
            "textMessage": {"text": text},
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(url, json=payload, headers=self._headers())
                r.raise_for_status()
                return True
        except Exception as e:
            logger.error("evolution_send_text_failed", error=str(e), phone=phone)
            return False

    async def send_audio(self, instance: str, phone: str, audio_bytes: bytes) -> bool:
        """Envia áudio como mensagem de voz (ptt) via Evolution API."""
        url = f"{self.base_url}/message/sendWhatsAppAudio/{self._instance_url(instance)}"
        payload = {
            "number": phone,
            "audioMessage": {"audio": base64.b64encode(audio_bytes).decode()},
            "options": {"encoding": True},
        }
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.post(url, json=payload, headers=self._headers())
                if not r.is_success:
                    logger.error("evolution_send_audio_failed", status=r.status_code, body=r.text, phone=phone)
                    return False
                return True
        except Exception as e:
            logger.error("evolution_send_audio_failed", error=str(e), phone=phone)
            return False

    async def send_read_receipt(self, instance: str, phone: str) -> None:
        """Marca mensagem como lida antes de começar a digitar."""
        url = f"{self.base_url}/chat/sendPresence/{self._instance_url(instance)}"
        payload = {"number": phone, "presence": "available", "delay": 500}
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                await client.post(url, json=payload, headers=self._headers())
        except Exception:
            pass

    async def send_typing(self, instance: str, phone: str, response_text: str = "") -> None:
        """Simula digitação com duração proporcional ao tamanho da resposta."""
        url = f"{self.base_url}/chat/sendPresence/{self._instance_url(instance)}"
        # ~150 chars/s de digitação, mínimo 2s, máximo 12s, com jitter de ±20%
        base_ms = max(2000, min(int(len(response_text) / 150 * 1000), 12000))
        delay_ms = int(base_ms * random.uniform(0.8, 1.2))
        payload = {"number": phone, "presence": "composing", "delay": delay_ms}
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                await client.post(url, json=payload, headers=self._headers())
        except Exception:
            pass

    async def get_media_base64(self, instance: str, message_id: str, remote_jid: str = "") -> Optional[tuple[bytes, str]]:
        """Baixa mídia de uma mensagem e retorna (bytes, mimetype)."""
        url = f"{self.base_url}/chat/getBase64FromMediaMessage/{instance}"
        key: dict = {"id": message_id}
        if remote_jid:
            key["remoteJid"] = remote_jid
        payload = {"message": {"key": key}, "convertToMp4": False}
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(url, json=payload, headers=self._headers())
                r.raise_for_status()
                data = r.json()
                b64 = data.get("base64", "")
                mime = data.get("mimetype", "image/jpeg")
                return base64.b64decode(b64), mime
        except Exception as e:
            logger.error("evolution_get_media_failed", error=str(e))
            return None

    async def create_instance(self, instance_name: str, phone_number: str) -> dict:
        url = f"{self.base_url}/instance/create"
        payload = {
            "instanceName": instance_name,
            "number": phone_number,
            "qrcode": True,
            "integration": "WHATSAPP-BAILEYS",
        }
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(url, json=payload, headers=self._headers())
            r.raise_for_status()
            return r.json()

    async def get_qrcode(self, instance: str) -> Optional[str]:
        url = f"{self.base_url}/instance/connect/{instance}"
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                r = await client.get(url, headers=self._headers())
                data = r.json()
                return data.get("base64") or data.get("qrcode", {}).get("base64")
        except Exception as e:
            logger.error("evolution_qrcode_failed", error=str(e))
            return None

    async def get_instance_status(self, instance: str) -> dict:
        url = f"{self.base_url}/instance/connectionState/{instance}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url, headers=self._headers())
                return r.json()
        except Exception as e:
            logger.error("evolution_status_failed", error=str(e))
            return {"state": "unknown"}

    async def delete_instance(self, instance: str) -> bool:
        url = f"{self.base_url}/instance/delete/{instance}"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.delete(url, headers=self._headers())
                return r.status_code < 300
        except Exception:
            return False

    async def set_webhook(self, instance: str, webhook_url: str) -> bool:
        url = f"{self.base_url}/webhook/set/{instance}"
        payload = {
            "url": webhook_url,
            "webhook_by_events": False,
            "webhook_base64": True,
            "events": [
                "MESSAGES_UPSERT",
                "MESSAGES_UPDATE",
                "CONNECTION_UPDATE",
                "QRCODE_UPDATED",
            ],
        }
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.post(url, json=payload, headers=self._headers())
                return r.status_code < 300
        except Exception as e:
            logger.error("evolution_webhook_failed", error=str(e))
            return False

    async def list_instances(self) -> list[dict]:
        url = f"{self.base_url}/instance/fetchInstances"
        try:
            async with httpx.AsyncClient(timeout=15) as client:
                r = await client.get(url, headers=self._headers())
                return r.json() if isinstance(r.json(), list) else []
        except Exception:
            return []


evolution_client = EvolutionAPIClient()

# ─── Anti-ban: Rate limiting por número ──────────────────────────────────────
_rate_limit: Dict[str, list] = {}          # phone -> lista de timestamps
RATE_LIMIT_MAX = 5                         # máx mensagens por janela
RATE_LIMIT_WINDOW = 60                     # segundos

# ─── Anti-ban: Cap diário por instância ──────────────────────────────────────
_daily_count: Dict[str, dict] = {}         # instance -> {date, count}
DAILY_CAP_DEFAULT = 200                    # máx mensagens/dia em operação normal
DAILY_CAP_WARMUP  = 30                     # máx mensagens/dia para número novo (<30d)

# ─── Anti-ban: Idempotência ───────────────────────────────────────────────────
_processed_ids: Dict[str, float] = {}      # message_id -> timestamp (epoch)
_IDEMPOTENCY_TTL = 3600                    # 1h — após isso descarta o cache

# ─── Anti-ban: Opt-out ───────────────────────────────────────────────────────
_optout_phones: set = set()
_OPTOUT_KEYWORDS = {
    "parar", "para", "stop", "sair", "cancelar", "cancelamento",
    "não quero mais", "nao quero mais", "remover", "descadastrar",
    "descadastre", "não me mande", "nao me mande", "bloquear",
}

# ─── Anti-ban: Horário comercial ─────────────────────────────────────────────
BUSINESS_HOUR_START = 8    # 08:00
BUSINESS_HOUR_END   = 20   # 20:00


def _is_business_hours() -> bool:
    """Retorna True se estiver dentro do horário de atendimento (08h–20h)."""
    hour = datetime.now().hour
    return BUSINESS_HOUR_START <= hour < BUSINESS_HOUR_END


def _is_rate_limited(phone: str) -> bool:
    """Retorna True se o número excedeu o limite de mensagens recentes."""
    now = datetime.utcnow()
    cutoff = now - timedelta(seconds=RATE_LIMIT_WINDOW)
    timestamps = [t for t in _rate_limit.get(phone, []) if t > cutoff]
    _rate_limit[phone] = timestamps
    if len(timestamps) >= RATE_LIMIT_MAX:
        return True
    _rate_limit[phone].append(now)
    return False


def _is_daily_cap_reached(instance: str, warmup: bool = False) -> bool:
    """Retorna True se a instância atingiu o limite diário de mensagens."""
    today = datetime.utcnow().date().isoformat()
    entry = _daily_count.get(instance, {})
    if entry.get("date") != today:
        _daily_count[instance] = {"date": today, "count": 0}
        entry = _daily_count[instance]
    cap = DAILY_CAP_WARMUP if warmup else DAILY_CAP_DEFAULT
    if entry["count"] >= cap:
        return True
    _daily_count[instance]["count"] += 1
    return False


def _is_duplicate(message_id: str) -> bool:
    """Retorna True se esta mensagem já foi processada (webhook duplicado)."""
    import time
    now = time.time()
    # Limpa cache expirado
    expired = [mid for mid, ts in _processed_ids.items() if now - ts > _IDEMPOTENCY_TTL]
    for mid in expired:
        del _processed_ids[mid]
    if message_id in _processed_ids:
        return True
    _processed_ids[message_id] = now
    return False


def _is_optout(phone: str, text: str) -> bool:
    """Retorna True se o usuário pediu para sair da lista."""
    if phone in _optout_phones:
        return True
    text_lower = (text or "").lower().strip()
    for kw in _OPTOUT_KEYWORDS:
        if kw in text_lower:
            _optout_phones.add(phone)
            logger.info("optout_registered", phone=phone, keyword=kw)
            return True
    return False


async def _human_delay(text: str = "") -> None:
    """Simula tempo humano de leitura + digitação com jitter aleatório.

    - Base: 1.5–3.5 s (tempo de ler a mensagem recebida)
    - Adicional proporcional ao tamanho da resposta (~150 chars/s de "digitação")
    - Jitter de ±30 % para nunca ser previsível
    """
    base = random.uniform(1.5, 3.5)
    typing_time = len(text) / 150.0          # ~150 chars/segundo = digitador rápido
    typing_time = min(typing_time, 8.0)      # nunca mais de 8 s extra
    total = (base + typing_time) * random.uniform(0.7, 1.3)
    await asyncio.sleep(total)


_last_reply_debug: dict = {}

# ─── Orquestrador principal ───────────────────────────────────────────────────
class WhatsAppOrchestrator:
    """
    Recebe mensagem do webhook, processa com o agente e envia resposta.
    """

    async def handle_incoming(
        self,
        msg: IncomingMessage,
        company_id: str,
        attendant_name: str = "Ana",
        company_name: str = "nosso escritório",
        tts_voice_gender: str = "female",
        warmup_mode: bool = False,
    ) -> None:
        # ── Anti-ban: idempotência — ignora webhook duplicado ─────────────────
        if msg.message_id and _is_duplicate(msg.message_id):
            logger.info("duplicate_message_ignored", message_id=msg.message_id)
            return

        # ── Anti-ban: opt-out — para de responder se pediu sair ──────────────
        if _is_optout(msg.phone, msg.text or ""):
            await evolution_client.send_read_receipt(msg.instance, msg.phone)
            if msg.phone in _optout_phones and (msg.text or "").lower().strip() in _OPTOUT_KEYWORDS:
                # Confirma o descadastro uma única vez
                await evolution_client.send_text(
                    msg.instance, msg.phone,
                    "Tudo bem! Você foi removido da lista de atendimento automático. "
                    "Se precisar de ajuda futuramente, basta nos contatar novamente. 👋"
                )
            return

        # ── Anti-ban: horário comercial ───────────────────────────────────────
        if not _is_business_hours():
            logger.info("outside_business_hours", phone=msg.phone)
            # Apenas marca como lido — não responde fora do horário
            await evolution_client.send_read_receipt(msg.instance, msg.phone)
            return

        # ── Anti-ban: cap diário por instância ───────────────────────────────
        if _is_daily_cap_reached(msg.instance, warmup=warmup_mode):
            logger.warning("daily_cap_reached", instance=msg.instance)
            return

        # ── Anti-ban: rate limit por número ───────────────────────────────────
        if _is_rate_limited(msg.phone):
            logger.warning("rate_limit_exceeded", phone=msg.phone)
            return

        # ── Anti-ban: health check — verifica conexão antes de processar ──────
        status = await evolution_client.get_instance_status(msg.instance)
        conn_state = (status.get("instance", {}).get("state") or status.get("state") or "")
        if conn_state.lower() not in ("open", "connected", ""):
            logger.error("instance_disconnected", instance=msg.instance, state=conn_state)
            return

        state = get_conversation(msg.instance, msg.phone, company_id)

        # ── Anti-ban: marca como lido antes de qualquer ação ──────────────────
        await evolution_client.send_read_receipt(msg.instance, msg.phone)

        # ── Anti-ban: delay humano de leitura antes de processar ──────────────
        await asyncio.sleep(random.uniform(0.8, 2.0))

        image_b64: Optional[str] = None
        image_mime: Optional[str] = None
        text_for_agent = msg.text or ""
        is_doc_analysis = False  # controla se deve usar max_tokens maior

        # ── Áudio → Whisper ──────────────────────────────────────────────────
        if msg.type == MessageType.AUDIO:
            if msg.media_base64:
                audio_bytes = base64.b64decode(msg.media_base64)
            else:
                media = await evolution_client.get_media_base64(msg.instance, msg.message_id, msg.phone)
                audio_bytes = media[0] if media else b""

            if audio_bytes:
                transcript = await whatsapp_agent.transcribe_audio(audio_bytes, "audio.ogg")
                text_for_agent = f"[Áudio transcrito]: {transcript}"
                logger.info("audio_transcribed", phone=msg.phone, length=len(transcript))

        # ── Imagem/Documento → IDP ────────────────────────────────────────────
        elif msg.type in (MessageType.IMAGE, MessageType.DOCUMENT):
            if msg.media_base64:
                media_bytes = base64.b64decode(msg.media_base64)
                mime = msg.mimetype or "image/jpeg"
            else:
                media = await evolution_client.get_media_base64(msg.instance, msg.message_id, msg.phone)
                if media:
                    media_bytes, mime = media
                else:
                    media_bytes, mime = b"", "image/jpeg"

            if media_bytes:
                # Processa via IDP (extrai dados do documento)
                doc_result = await whatsapp_agent.process_document_media(media_bytes, mime, state)
                if doc_result:
                    # Monta análise completa do documento para o agente
                    doc_type = doc_result.get("document_type", "documento")
                    lines = [
                        "[Documento fiscal recebido — dados extraídos automaticamente pelo IDP]",
                        f"Tipo: {doc_type}",
                    ]
                    if doc_result.get("number"):
                        lines.append(f"Número: {doc_result['number']}" + (f" / Série: {doc_result['series']}" if doc_result.get("series") else ""))
                    if doc_result.get("issue_date"):
                        lines.append(f"Data de emissão: {doc_result['issue_date']}")
                    if doc_result.get("due_date"):
                        lines.append(f"Vencimento: {doc_result['due_date']}")
                    if doc_result.get("issuer_name"):
                        lines.append(f"Emitente: {doc_result['issuer_name']}" + (f" (CNPJ: {doc_result['issuer_cnpj']})" if doc_result.get("issuer_cnpj") else ""))
                    if doc_result.get("issuer_address"):
                        lines.append(f"Endereço emitente: {doc_result['issuer_address']}")
                    if doc_result.get("recipient_name"):
                        lines.append(f"Destinatário: {doc_result['recipient_name']}" + (f" (CNPJ: {doc_result['recipient_cnpj']})" if doc_result.get("recipient_cnpj") else ""))
                    if doc_result.get("total_value") is not None:
                        lines.append(f"Valor total: R$ {doc_result['total_value']:.2f}")
                    if doc_result.get("net_value") is not None:
                        lines.append(f"Valor líquido: R$ {doc_result['net_value']:.2f}")
                    if doc_result.get("discount"):
                        lines.append(f"Desconto: R$ {doc_result['discount']:.2f}")
                    if doc_result.get("freight"):
                        lines.append(f"Frete: R$ {doc_result['freight']:.2f}")
                    if doc_result.get("payment_method"):
                        lines.append(f"Forma de pagamento: {doc_result['payment_method']}")
                    if doc_result.get("bar_code"):
                        lines.append(f"Código de barras: {doc_result['bar_code']}")
                    taxes = doc_result.get("taxes", [])
                    if taxes:
                        lines.append("Impostos:")
                        for t in taxes:
                            name = t.get("name", "")
                            rate = f" ({t['rate']}%)" if t.get("rate") else ""
                            val = f" = R$ {t['value']:.2f}" if t.get("value") is not None else ""
                            base = f" sobre base R$ {t['base']:.2f}" if t.get("base") is not None else ""
                            lines.append(f"  - {name}{rate}{val}{base}")
                    items = doc_result.get("line_items", [])
                    if items:
                        lines.append("Itens/Serviços:")
                        for it in items:
                            desc = it.get("description", "")
                            qty = it.get("quantity")
                            unit = it.get("unit_price")
                            total_i = it.get("total")
                            ncm = f" NCM: {it['ncm']}" if it.get("ncm") else ""
                            cfop = f" CFOP: {it['cfop']}" if it.get("cfop") else ""
                            detail = f" ({qty} x R$ {unit:.2f} = R$ {total_i:.2f})" if qty and unit and total_i else (f" R$ {total_i:.2f}" if total_i else "")
                            lines.append(f"  - {desc}{detail}{ncm}{cfop}")
                    if doc_result.get("description"):
                        lines.append(f"Descrição/Histórico: {doc_result['description']}")
                    alerts = doc_result.get("alerts", [])
                    if alerts:
                        lines.append("Alertas: " + "; ".join(alerts))
                    suggestions = doc_result.get("suggestions", [])
                    if suggestions:
                        lines.append("Sugestões: " + "; ".join(suggestions))
                    lines.append(f"\nConfiança da extração: {int((doc_result.get('confidence_score') or 0) * 100)}%")
                    lines.append("\nCom base nesses dados, faça uma análise contábil completa e detalhada deste documento, explicando cada item, os impostos incidentes, o tratamento contábil adequado e qualquer ponto de atenção.")
                    text_for_agent = "\n".join(lines)
                    is_doc_analysis = True
                    # Para imagens, passa também para o agente ver visualmente
                    if mime.startswith("image/"):
                        image_b64 = base64.b64encode(media_bytes).decode()
                        image_mime = mime
                else:
                    text_for_agent = "[Documento recebido — não foi possível extrair dados automaticamente. Por favor, informe o tipo e valor.]"

        # ── Extrai info do cliente (nome/CNPJ) se ainda não temos ─────────────
        if text_for_agent:
            whatsapp_agent.extract_client_info(state, text_for_agent)

        # ── Decide próxima etapa da conversa ──────────────────────────────────
        next_stage = whatsapp_agent.decide_next_stage(state, text_for_agent)
        state.stage = next_stage

        # ── Registra mensagem do usuário no histórico ─────────────────────────
        state.messages.append(ConversationMessage(
            role="user",
            content=text_for_agent or "[arquivo]",
            type=msg.type,
        ))

        # ── Gera resposta do agente ───────────────────────────────────────────
        response = await whatsapp_agent.respond(
            state=state,
            new_message=text_for_agent,
            attendant_name=attendant_name,
            company_name=company_name,
            image_b64=image_b64,
            image_mime=image_mime,
            max_tokens=1800 if is_doc_analysis else 500,
        )

        # ── Registra resposta no histórico ────────────────────────────────────
        state.messages.append(ConversationMessage(
            role="assistant",
            content=response,
        ))
        save_conversation(state)

        # ── Envia resposta pelo WhatsApp ──────────────────────────────────────
        is_doc_req = whatsapp_agent.is_document_request(response)
        # Se o usuário enviou áudio, sempre responde com áudio (melhor UX)
        is_audio_reply = msg.type == MessageType.AUDIO
        _last_reply_debug.update({
            "msg_type": str(msg.type),
            "is_audio_reply": is_audio_reply,
            "is_doc_request": is_doc_req,
            "response_preview": response[:80],
            "tts_voice_gender": tts_voice_gender,
            "phone": msg.phone,
        })

        if is_audio_reply:
            # Áudio: typing proporcional + delay humano antes de enviar
            await evolution_client.send_typing(msg.instance, msg.phone, response)
            await _human_delay(response)
            try:
                tts_bytes = await whatsapp_agent.text_to_audio(response, voice_gender=tts_voice_gender)
                _last_reply_debug["tts_bytes"] = len(tts_bytes)
                sent = await evolution_client.send_audio(msg.instance, msg.phone, tts_bytes)
                _last_reply_debug["send_audio_ok"] = sent
                if not sent:
                    await _send_chunked(msg.instance, msg.phone, response)
            except Exception as e:
                _last_reply_debug["audio_error"] = str(e)
                logger.error("tts_or_send_failed", error=str(e))
                await _send_chunked(msg.instance, msg.phone, response)
        else:
            await _send_chunked(msg.instance, msg.phone, response)

        logger.info(
            "whatsapp_response_sent",
            phone=msg.phone,
            stage=state.stage.value,
            docs=len(state.collected_docs),
            audio_reply=msg.type == MessageType.AUDIO,
        )


def _split_message(text: str, max_len: int = 800) -> list[str]:
    """Divide mensagem longa em blocos naturais (parágrafos → frases).

    Mantém blocos curtos juntos para não spam de mensagens.
    """
    if len(text) <= max_len:
        return [text]

    # Tenta dividir por parágrafo duplo primeiro
    parts: list[str] = []
    current = ""
    for block in text.split("\n\n"):
        block = block.strip()
        if not block:
            continue
        if len(current) + len(block) + 2 <= max_len:
            current = (current + "\n\n" + block).strip()
        else:
            if current:
                parts.append(current)
            # bloco individual ainda grande? divide por frase
            if len(block) > max_len:
                sentences = block.replace(". ", ".\n").split("\n")
                for s in sentences:
                    s = s.strip()
                    if not s:
                        continue
                    if len(current) + len(s) + 1 <= max_len:
                        current = (current + " " + s).strip()
                    else:
                        if current:
                            parts.append(current)
                        current = s
            else:
                current = block
    if current:
        parts.append(current)
    return parts if parts else [text]


async def _send_chunked(instance: str, phone: str, text: str) -> None:
    """Envia mensagem em blocos com typing + delay humano entre cada um.

    Anti-ban: simula comportamento de digitação real, jamais envia tudo de uma vez.
    """
    chunks = _split_message(text)
    for i, chunk in enumerate(chunks):
        await evolution_client.send_typing(instance, phone, chunk)
        await _human_delay(chunk)
        await evolution_client.send_text(instance, phone, chunk)
        # Pausa entre blocos: mais longa do que o delay interno para naturalidade
        if i < len(chunks) - 1:
            await asyncio.sleep(random.uniform(1.0, 2.5))


orchestrator = WhatsAppOrchestrator()
