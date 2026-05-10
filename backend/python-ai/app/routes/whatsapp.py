"""
Rotas WhatsApp — Webhook Evolution API + Gerenciamento de Instâncias.
"""
import asyncio
import json
import structlog
from pathlib import Path
from fastapi import APIRouter, HTTPException, BackgroundTasks, Request
from pydantic import BaseModel
from typing import Optional
from urllib.parse import unquote

from app.config import settings
from app.models.whatsapp import IncomingMessage, MessageType, EvolutionWebhookPayload
from app.services.whatsapp_service import (
    evolution_client,
    orchestrator,
    get_conversation,
    list_conversations,
    clear_stale_conversations,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/whatsapp", tags=["WhatsApp"])

# ─── Registry persistente ──────────────────────────────────────────────────────
_REGISTRY_FILE = Path(__file__).parent.parent.parent / "instance_registry.json"

def _load_registry() -> dict:
    try:
        if _REGISTRY_FILE.exists():
            return json.loads(_REGISTRY_FILE.read_text(encoding="utf-8"))
    except Exception:
        pass
    return {}

def _save_registry(registry: dict) -> None:
    try:
        _REGISTRY_FILE.write_text(json.dumps(registry, ensure_ascii=False, indent=2), encoding="utf-8")
    except Exception as e:
        logger.error("registry_save_failed", error=str(e))

_instance_registry: dict = _load_registry()


# ─── Webhook da Evolution API ─────────────────────────────────────────────────
@router.post("/webhook/{instance_name:path}")
async def evolution_webhook(
    instance_name: str,
    request: Request,
    background_tasks: BackgroundTasks,
):
    """Recebe eventos da Evolution API (mensagens, atualizações de status)."""
    instance_name = unquote(instance_name)

    try:
        body = await request.json()
    except Exception:
        return {"ok": True}

    # Salva último payload para debug
    global _last_raw_payload
    _last_raw_payload = body

    evt = body.get("event", "")

    if evt != "messages.upsert":
        if evt in ("connection.update", "qrcode.updated"):
            state_info = body.get("data", {})
            conn_state = state_info.get("state", "")
            logger.info("whatsapp_connection", instance=instance_name, state=conn_state)
        return {"ok": True}

    # Verifica se IA está habilitada para esta instância
    config = _instance_registry.get(instance_name, {})
    if not config.get("ai_enabled", True):
        logger.info("whatsapp_ai_disabled", instance=instance_name)
        return {"ok": True}

    data = body.get("data", {})
    messages_list = data if isinstance(data, list) else [data]

    for raw_msg in messages_list:
        key = raw_msg.get("key", {})
        if key.get("fromMe", False):
            continue

        remote_jid = key.get("remoteJid", "")
        if "@g.us" in remote_jid:
            continue

        # senderPn contém o número real quando remoteJid é @lid (WhatsApp novo)
        sender_pn = key.get("senderPn", "")
        phone = sender_pn if sender_pn else remote_jid

        msg_type_raw = raw_msg.get("messageType", "conversation")
        type_map = {
            "conversation": MessageType.TEXT,
            "extendedTextMessage": MessageType.TEXT,
            "imageMessage": MessageType.IMAGE,
            "documentMessage": MessageType.DOCUMENT,
            "documentWithCaptionMessage": MessageType.DOCUMENT,
            "audioMessage": MessageType.AUDIO,
            "pttMessage": MessageType.AUDIO,
            "videoMessage": MessageType.VIDEO,
            "stickerMessage": MessageType.STICKER,
        }
        msg_type = type_map.get(msg_type_raw, MessageType.TEXT)

        msg_content = raw_msg.get("message", {})
        text = (
            msg_content.get("conversation")
            or msg_content.get("extendedTextMessage", {}).get("text")
            or msg_content.get("documentWithCaptionMessage", {}).get("message", {}).get("documentMessage", {}).get("caption", "")
            or ""
        )

        # base64 pode estar em raw_msg.message.base64 ou raw_msg.base64 (v2)
        media_b64 = (
            msg_content.get("base64")
            or raw_msg.get("base64")
            or ""
        )
        mimetype = ""
        if msg_type == MessageType.IMAGE:
            mimetype = msg_content.get("imageMessage", {}).get("mimetype", "image/jpeg")
        elif msg_type == MessageType.DOCUMENT:
            doc_msg = (
                msg_content.get("documentMessage")
                or msg_content.get("documentWithCaptionMessage", {}).get("message", {}).get("documentMessage")
                or {}
            )
            mimetype = doc_msg.get("mimetype", "application/pdf")
        elif msg_type == MessageType.AUDIO:
            mimetype = "audio/ogg"

        msg = IncomingMessage(
            instance=instance_name,
            phone=phone,
            message_id=key.get("id", ""),
            type=msg_type,
            text=text or None,
            media_base64=media_b64 or None,
            mimetype=mimetype or None,
        )

        company_id = config.get("company_id", "default")
        attendant_name = config.get("attendant_name", "Ana")
        company_name = config.get("company_name", "nosso escritório")
        tts_voice_gender = config.get("tts_voice_gender", "female")
        warmup_mode = config.get("warmup_mode", False)

        async def _safe_handle(m, cid, an, cn, tts, wm):
            try:
                await orchestrator.handle_incoming(m, cid, an, cn, tts, warmup_mode=wm)
            except Exception as exc:
                logger.error("handle_incoming_error", error=str(exc), exc_info=True)

        background_tasks.add_task(_safe_handle, msg, company_id, attendant_name, company_name, tts_voice_gender, warmup_mode)

    return {"ok": True}


# ─── Gerenciamento de Instâncias ──────────────────────────────────────────────
class CreateInstanceRequest(BaseModel):
    instance_name: str
    phone_number: str
    company_id: str
    company_name: str
    attendant_name: str = "Ana"
    ai_enabled: bool = True
    tts_voice_gender: str = "female"  # "female" | "male"
    warmup_mode: bool = False          # True para números novos (<30 dias) — cap de 30 msgs/dia


class ToggleAIRequest(BaseModel):
    ai_enabled: bool


class VoiceGenderRequest(BaseModel):
    tts_voice_gender: str  # "female" | "male"


@router.post("/instances")
async def create_instance(req: CreateInstanceRequest):
    """Cria e conecta uma nova instância WhatsApp via Evolution API."""
    try:
        result = await evolution_client.create_instance(req.instance_name, req.phone_number)

        _instance_registry[req.instance_name] = {
            "company_id": req.company_id,
            "company_name": req.company_name,
            "attendant_name": req.attendant_name,
            "phone_number": req.phone_number,
            "ai_enabled": req.ai_enabled,
            "tts_voice_gender": req.tts_voice_gender,
            "warmup_mode": req.warmup_mode,
        }
        _save_registry(_instance_registry)

        webhook_url = f"{settings.whatsapp_webhook_base_url}/api/v1/whatsapp/webhook/{req.instance_name}"
        await evolution_client.set_webhook(req.instance_name, webhook_url)

        return {
            "instance": req.instance_name,
            "status": "created",
            "webhook_url": webhook_url,
            "evolution_response": result,
        }
    except Exception as e:
        logger.error("create_instance_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/instances")
async def list_instances():
    """Lista todas as instâncias e status de conexão."""
    instances = await evolution_client.list_instances()
    result = []
    for inst in instances:
        # Evolution API v2: flat structure with "name" and "connectionStatus"
        # Evolution API v1: nested under "instance" with "instanceName" and "status"
        if "name" in inst:
            name = inst.get("name", "")
            status = inst.get("connectionStatus", "unknown")
        else:
            name = inst.get("instance", {}).get("instanceName", "")
            status = inst.get("instance", {}).get("status") or inst.get("instance", {}).get("state", "unknown")
        if not name:
            continue
        config = _instance_registry.get(name, {})
        result.append({
            "instance_name": name,
            "status": status,
            "phone_number": config.get("phone_number", ""),
            "company_id": config.get("company_id", ""),
            "company_name": config.get("company_name", ""),
            "attendant_name": config.get("attendant_name", "Ana"),
            "ai_enabled": config.get("ai_enabled", True),
            "tts_voice_gender": config.get("tts_voice_gender", "female"),
            "warmup_mode": config.get("warmup_mode", False),
        })
    return result


@router.get("/instances/{instance_name}/qrcode")
async def get_qrcode(instance_name: str):
    """Retorna QR Code base64 para conectar o WhatsApp."""
    qr = await evolution_client.get_qrcode(instance_name)
    if not qr:
        raise HTTPException(status_code=404, detail="QR Code não disponível — pode já estar conectado.")
    return {"qrcode": qr}


@router.get("/instances/{instance_name}/status")
async def get_status(instance_name: str):
    """Verifica o status de conexão da instância."""
    return await evolution_client.get_instance_status(instance_name)


@router.delete("/instances/{instance_name}")
async def delete_instance(instance_name: str):
    """Desconecta e remove uma instância."""
    ok = await evolution_client.delete_instance(instance_name)
    _instance_registry.pop(instance_name, None)
    _save_registry(_instance_registry)
    return {"deleted": ok, "instance": instance_name}


@router.put("/instances/{instance_name}/config")
async def update_instance_config(instance_name: str, req: CreateInstanceRequest):
    """Atualiza configuração da instância."""
    _instance_registry[instance_name] = {
        "company_id": req.company_id,
        "company_name": req.company_name,
        "attendant_name": req.attendant_name,
        "phone_number": req.phone_number,
        "ai_enabled": req.ai_enabled,
        "tts_voice_gender": req.tts_voice_gender,
        "warmup_mode": req.warmup_mode,
    }
    _save_registry(_instance_registry)
    return {"updated": True, "instance": instance_name}


@router.patch("/instances/{instance_name}/voice-gender")
async def set_voice_gender(instance_name: str, req: VoiceGenderRequest):
    """Define voz feminina ou masculina para respostas em áudio."""
    if req.tts_voice_gender not in ("female", "male"):
        raise HTTPException(status_code=400, detail="tts_voice_gender deve ser 'female' ou 'male'")
    if instance_name not in _instance_registry:
        _instance_registry[instance_name] = {}
    _instance_registry[instance_name]["tts_voice_gender"] = req.tts_voice_gender
    _save_registry(_instance_registry)
    voice_name = "pt-BR-FranciscaNeural" if req.tts_voice_gender == "female" else "pt-BR-AntonioNeural"
    logger.info("whatsapp_voice_changed", instance=instance_name, gender=req.tts_voice_gender)
    return {"instance": instance_name, "tts_voice_gender": req.tts_voice_gender, "voice": voice_name}


@router.patch("/instances/{instance_name}/toggle-ai")
async def toggle_ai(instance_name: str, req: ToggleAIRequest):
    """Ativa ou desativa o atendente IA para esta instância."""
    if instance_name not in _instance_registry:
        _instance_registry[instance_name] = {}
    _instance_registry[instance_name]["ai_enabled"] = req.ai_enabled
    _save_registry(_instance_registry)
    status = "ativado" if req.ai_enabled else "desativado"
    logger.info("whatsapp_ai_toggle", instance=instance_name, ai_enabled=req.ai_enabled)
    return {"instance": instance_name, "ai_enabled": req.ai_enabled, "status": status}


# ─── Debug: captura último payload recebido ───────────────────────────────────
_last_raw_payload: dict = {}
_last_audio_error: dict = {}

@router.get("/debug/last-webhook")
async def get_last_webhook():
    return _last_raw_payload

@router.get("/debug/last-audio-error")
async def get_last_audio_error():
    return _last_audio_error

@router.get("/debug/last-reply")
async def get_last_reply_debug():
    from app.services.whatsapp_service import _last_reply_debug
    return _last_reply_debug

@router.post("/debug/test-audio")
async def test_audio(instance_name: str, phone: str):
    """Testa geração de áudio TTS e envio via Evolution API."""
    from app.agents.whatsapp_agent import whatsapp_agent
    result: dict = {}

    # 1. Testa edge-tts
    try:
        audio_bytes = await whatsapp_agent.text_to_audio("Olá, este é um teste de áudio.", voice_gender="female")
        result["tts_bytes"] = len(audio_bytes)
        result["tts_ok"] = len(audio_bytes) > 0
    except Exception as e:
        result["tts_ok"] = False
        result["tts_error"] = str(e)
        return result

    # 2. Testa envio pelo Evolution API
    try:
        sent = await evolution_client.send_audio(instance_name, phone, audio_bytes)
        result["send_ok"] = sent
    except Exception as e:
        result["send_ok"] = False
        result["send_error"] = str(e)

    return result

# ─── Conversas ────────────────────────────────────────────────────────────────
@router.get("/conversations")
async def get_conversations(company_id: str):
    """Lista conversas ativas de uma empresa."""
    return list_conversations(company_id)


@router.get("/conversations/{instance_name}/{phone}")
async def get_conversation_detail(instance_name: str, phone: str, company_id: str):
    """Retorna histórico completo de uma conversa."""
    from app.services.whatsapp_service import _conversations
    # Busca por phone_jid completo ou pelo número sem sufixo
    state = None
    for key, s in _conversations.items():
        if s.instance_name == instance_name and (s.phone == phone or s.phone.split("@")[0] == phone):
            state = s
            break
    if state is None:
        state = get_conversation(instance_name, phone, company_id)
    return {
        "phone": state.phone,
        "stage": state.stage.value,
        "client_name": state.client_name,
        "client_cnpj": state.client_cnpj,
        "messages": [m.model_dump() for m in state.messages],
        "collected_docs": state.collected_docs,
        "created_at": state.created_at.isoformat(),
        "updated_at": state.updated_at.isoformat(),
    }


@router.post("/cleanup")
async def cleanup_stale():
    """Remove conversas inativas há mais de 24h."""
    removed = clear_stale_conversations()
    return {"removed": removed}
