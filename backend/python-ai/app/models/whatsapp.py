from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum
from datetime import datetime


class ConversationStage(str, Enum):
    GREETING       = "greeting"         # Saudação inicial
    IDENTIFY       = "identify"         # Identificar quem é o cliente
    COLLECT_DOCS   = "collect_docs"     # Coletar documentos/notas
    ASK_DETAILS    = "ask_details"      # Perguntar detalhes específicos
    PROCESS        = "process"          # Processando arquivos
    REVIEW         = "review"           # Revisão com cliente
    COMPLETED      = "completed"        # Concluído


class MessageType(str, Enum):
    TEXT      = "text"
    IMAGE     = "image"
    DOCUMENT  = "document"
    AUDIO     = "audio"
    VIDEO     = "video"
    STICKER   = "sticker"


class IncomingMessage(BaseModel):
    instance:     str
    phone:        str          # remoteJid completo (ex: 5511999998888@s.whatsapp.net ou @lid)
    message_id:   str
    type:         MessageType
    text:         Optional[str] = None
    media_url:    Optional[str] = None
    media_base64: Optional[str] = None
    mimetype:     Optional[str] = None
    filename:     Optional[str] = None
    timestamp:    datetime = Field(default_factory=datetime.utcnow)


class ConversationMessage(BaseModel):
    role:      str   # "user" | "assistant"
    content:   str
    type:      MessageType = MessageType.TEXT
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    media_url: Optional[str] = None


class ConversationState(BaseModel):
    phone:          str
    company_id:     str              # empresa do escritório vinculada à instância
    instance_name:  str
    stage:          ConversationStage = ConversationStage.GREETING
    client_name:    Optional[str] = None
    client_cnpj:    Optional[str] = None
    messages:       List[ConversationMessage] = []
    collected_docs: List[dict] = []  # documentos já processados nessa conversa
    pending_info:   dict = {}        # informações que ainda precisam ser coletadas
    created_at:     datetime = Field(default_factory=datetime.utcnow)
    updated_at:     datetime = Field(default_factory=datetime.utcnow)


class WhatsAppInstance(BaseModel):
    instance_name: str
    phone_number:  str
    company_id:    str
    company_name:  str
    connected:     bool = False
    qr_code:       Optional[str] = None
    profile_name:  Optional[str] = None
    attendant_name: str = "Ana"
    attendant_role: str = "Assistente Contábil"


class EvolutionWebhookPayload(BaseModel):
    """Payload recebido da Evolution API via webhook."""
    event:    str
    instance: str
    data:     dict
