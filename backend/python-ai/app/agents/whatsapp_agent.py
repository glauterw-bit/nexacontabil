"""
WhatsApp AI Agent — Atendente contábil humanizado via Claude (Anthropic).
Coleta documentos, extrai dados, responde como especialista em contabilidade.
"""
import re
import structlog
from datetime import datetime
from typing import Optional

import anthropic
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings
from app.models.whatsapp import ConversationState, ConversationStage, ConversationMessage, MessageType
from app.services.idp_service import idp_service
from app.services.nestjs_client import save_document_to_db

logger = structlog.get_logger()


# ─── System Prompt Principal ────────────────────────────────────────────────
def build_system_prompt(state: ConversationState, attendant_name: str, company_name: str) -> str:
    collected = len(state.collected_docs)
    client    = state.client_name or "o cliente"
    stage_ctx = {
        ConversationStage.GREETING:     "Você acabou de receber uma nova mensagem. Faça uma saudação calorosa.",
        ConversationStage.IDENTIFY:     "Identifique quem é o cliente, nome e CNPJ da empresa dele.",
        ConversationStage.COLLECT_DOCS: f"Você já coletou {collected} documento(s). Continue coletando notas fiscais, boletos, extratos e outros documentos.",
        ConversationStage.ASK_DETAILS:  "Faça perguntas específicas para complementar as informações dos documentos recebidos.",
        ConversationStage.PROCESS:      "Informe que está processando os documentos com IA.",
        ConversationStage.REVIEW:       "Apresente um resumo do que foi processado e confirme com o cliente.",
        ConversationStage.COMPLETED:    "Finalize o atendimento de forma cordial.",
    }.get(state.stage, "")

    return f"""Você é {attendant_name}, assistente contábil virtual do escritório {company_name}.

## SUA PERSONALIDADE
Você tem uma personalidade vibrante, animada e acolhedora — como aquela amiga que entende tudo de contabilidade e ainda deixa o papo leve!
- Fale com ENERGIA e entusiasmo genuíno, como se adorasse o que faz (e adora mesmo!)
- Use linguagem descontraída e natural do brasileiro — "Ótimo!", "Que legal!", "Perfeito!", "Vamos lá!"
- Seja calorosa, próxima e empática — chame pelo nome sempre que souber
- Use emojis com personalidade (1-2 por mensagem): não só 😊 mas também 🎯 ✅ 🙌 💪 📄
- Demonstre que se importa de verdade com o negócio do cliente
- Quando receber um documento, celebre: "Recebi sim! Já estou analisando aqui pra você!"
- Responda de forma CONCISA e animada — no máximo 3-4 linhas por mensagem, EXCETO quando analisar documentos fiscais
- Quando receber uma mensagem iniciando com "[Documento fiscal recebido", faça uma ANÁLISE CONTÁBIL COMPLETA: explique cada item, os impostos, o tratamento contábil adequado e pontos de atenção. Nesse caso, seja detalhada e técnica, use listas organizadas, pode ser longo.
- Nunca envie listas longas de uma vez em conversas normais — divida em mensagens curtas e dinâmicas
- Quando sua resposta for lida em voz alta (TTS): escreva como se estivesse FALANDO, não escrevendo. Use vírgulas para criar pausas naturais. Varie o ritmo com frases curtas e longas alternadas. Exemplo: "Oi, tudo bem? Que ótimo que você entrou em contato! Vou te ajudar agora mesmo."

## SUA ESPECIALIDADE
Você é especialista em contabilidade brasileira e adora explicar de forma simples:
- Notas fiscais (NF-e, NFS-e, CT-e), boletos, extratos bancários
- SPED Fiscal, SPED Contribuições, ECF, EFD-Reinf
- Impostos: ICMS, IPI, PIS, COFINS, ISS, IRPJ, CSLL, INSS
- Simples Nacional, Lucro Presumido, Lucro Real
- Pró-labore, folha de pagamento, férias

## COMO COLETAR INFORMAÇÕES
1. Sempre peça um documento de cada vez, de forma animada e encorajadora
2. Quando receber foto/PDF, confirme com entusiasmo e processe
3. Pergunte: período de referência, tipo de documento, valor se não legível
4. Para notas fiscais: verifique CNPJ emitente, valor total, impostos
5. Para extratos: confirme o banco e o período

## FLUXO DE ATENDIMENTO
Etapa atual: {stage_ctx}
Cliente identificado: {client}
Documentos coletados até agora: {collected}

## REGRAS IMPORTANTES
- NUNCA invente valores ou dados — só use o que foi enviado
- Se não entender algo, peça para reenviar de forma simpática (nunca frustrada)
- Ao final, sempre pergunte com energia: "Tem mais alguma coisa que posso te ajudar?"
- Informe quando um arquivo foi processado com sucesso — comemore junto!
- Hoje é {datetime.now().strftime('%d/%m/%Y')}"""


class WhatsAppAgent:
    def __init__(self):
        self.client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
    async def respond(
        self,
        state: ConversationState,
        new_message: str,
        attendant_name: str = "Ana",
        company_name: str = "nosso escritório",
        image_b64: Optional[str] = None,
        image_mime: Optional[str] = None,
        max_tokens: int = 500,
    ) -> str:
        """Gera resposta humanizada baseada no contexto da conversa."""

        system = build_system_prompt(state, attendant_name, company_name)

        # Monta histórico das últimas 15 mensagens
        messages = []
        for msg in state.messages[-15:]:
            messages.append({"role": msg.role, "content": msg.content})

        # Mensagem atual (com imagem se houver)
        if image_b64 and image_mime:
            # Anthropic usa media_type diretamente
            media_type = image_mime if image_mime in ("image/jpeg", "image/png", "image/gif", "image/webp") else "image/jpeg"
            user_content = [
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": image_b64,
                    },
                },
                {"type": "text", "text": new_message or "Segue o documento:"},
            ]
        else:
            user_content = new_message or "..."

        messages.append({"role": "user", "content": user_content})

        response = await self.client.messages.create(
            model=settings.anthropic_model,
            system=system,
            messages=messages,
            max_tokens=max_tokens,
        )

        return response.content[0].text.strip()

    @staticmethod
    def is_document_request(text: str) -> bool:
        """Detecta se a resposta está PEDINDO um documento ao cliente (deve ir como texto).
        Usa frases completas para evitar falsos positivos.
        """
        phrases = [
            "me envie", "me manda", "me mande", "pode enviar",
            "pode mandar", "tire uma foto", "me encaminhe",
            "foto do", "foto da", "imagem do", "imagem da",
            "envie o", "envie a", "envie um", "envie uma",
            "mande o", "mande a", "mande um", "mande uma",
            "anexe o", "anexe a", "anexe um", "anexe uma",
            "digitaliz", "escanei", "escaneie",
        ]
        text_lower = text.lower()
        return any(ph in text_lower for ph in phrases)

    @staticmethod
    def _clean_for_tts(text: str) -> str:
        """Remove markdown, emojis e prepara texto para TTS com prosódia natural."""
        import re
        # Remove markdown
        text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
        text = re.sub(r'\*(.+?)\*', r'\1', text)
        text = re.sub(r'__(.+?)__', r'\1', text)
        text = re.sub(r'_(.+?)_', r'\1', text)
        text = re.sub(r'#+\s*', '', text)
        text = re.sub(r'`(.+?)`', r'\1', text)
        text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
        # Remove emojis
        text = re.sub(r'[^\w\s\.,;:!?\-\(\)\/\$%@áéíóúâêîôûãõàèìòùäëïöüçñ]', '', text, flags=re.UNICODE)
        # Quebras de linha viram pausas naturais (vírgula)
        text = re.sub(r'\n+', ', ', text)
        # Remove múltiplas vírgulas seguidas
        text = re.sub(r',\s*,+', ',', text)
        text = re.sub(r'\s+', ' ', text)
        return text.strip()

    async def _rewrite_for_spoken(self, text: str) -> str:
        """Reescreve o texto para soar energético, despojado e simpático quando falado por TTS."""
        try:
            resp = await self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                system="""Você transforma texto em fala brasileira jovem, despojada e cheia de energia para TTS.

PERSONA: atendente animada, gente boa, prestativa — fala como amiga que entende do assunto, sem ser formal nem robótica.

ESTILO OBRIGATÓRIO:
- Linguagem leve e despojada: "opa!", "vamos lá!", "deixa comigo!", "tranquilo!", "show!", "top!"
- Começo com energia: "Opa!", "Ei!", "Oi!", "Show!", "Perfeito!" — nunca começa neutro
- Meio animado com variação de ritmo: frase curta + frase média, alterna sempre
- Final SEMPRE subindo: "tá bom?", "pode deixar!", "fico no aguardo!", "qualquer coisa me fala!", "tô aqui!", "bora!" — NUNCA termina caindo
- Reticências para naturalidade e pausa: "Deixa eu ver aqui... pronto!", "E aí... que tal?"
- Interjeições soltas com vírgula que criam curva de voz: "Olha,", "Ei,", "Sabe,", "E aí,"
- Confirmações animadas no meio: "isso!", "exato!", "boa!", "certinho!"

PROIBIDO: linguagem formal, frases que terminam em ponto seco sem energia, listas, markdown.
Responda APENAS com o texto reescrito, sem aspas nem explicações.""",
                messages=[{"role": "user", "content": text}],
                max_tokens=400,
            )
            return resp.content[0].text.strip()
        except Exception as e:
            logger.warning("tts_rewrite_failed", error=str(e))
            return text

    async def text_to_audio(self, text: str, voice_gender: str = "female") -> bytes:
        """Converte texto em áudio.
        Prioridade: ElevenLabs → OpenAI tts-1-hd → gTTS
        """
        import httpx
        from app.config import settings

        # Reescreve para fala natural e energética
        spoken_text = await self._rewrite_for_spoken(text)
        clean_text = self._clean_for_tts(spoken_text)
        logger.info("tts_spoken_text", preview=clean_text[:100])

        # ── 1. ElevenLabs (mais natural e expressivo do mercado) ──────────────
        el_key = getattr(settings, "elevenlabs_api_key", "") or ""
        if el_key:
            voice_id = (
                settings.elevenlabs_voice_female
                if voice_gender == "female"
                else settings.elevenlabs_voice_male
            )
            try:
                async with httpx.AsyncClient(timeout=30) as http:
                    r = await http.post(
                        f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}",
                        headers={"xi-api-key": el_key, "Content-Type": "application/json"},
                        json={
                            "text": clean_text,
                            "model_id": "eleven_multilingual_v2",
                            "voice_settings": {
                                "stability": 0.10,         # muito baixo = máxima variação de tom
                                "similarity_boost": 0.75,
                                "style": 1.00,             # máximo = entrega mais emotiva e animada possível
                                "use_speaker_boost": True,
                            },
                        },
                    )
                    if r.is_success:
                        logger.info("tts_elevenlabs_ok", bytes=len(r.content))
                        return r.content
                    logger.warning("tts_elevenlabs_failed", status=r.status_code, body=r.text[:200])
            except Exception as e:
                logger.warning("tts_elevenlabs_error", error=str(e))

        # ── 2. Fallback: OpenAI tts-1-hd ─────────────────────────────────────
        openai_key = getattr(settings, "openai_api_key", "") or ""
        if openai_key and not openai_key.startswith("sk-coloque"):
            from openai import AsyncOpenAI
            voice = "nova" if voice_gender == "female" else "fable"
            client = AsyncOpenAI(api_key=openai_key)
            response = await client.audio.speech.create(
                model="tts-1-hd",
                voice=voice,
                input=clean_text,
                response_format="mp3",
                speed=1.0,
            )
            return response.content

        # ── 3. Fallback final: gTTS ───────────────────────────────────────────
        import asyncio
        import io
        from gtts import gTTS

        def _gtts() -> bytes:
            tts = gTTS(text=clean_text, lang="pt", tld="com.br", slow=False)
            buf = io.BytesIO()
            tts.write_to_fp(buf)
            return buf.getvalue()

        loop = asyncio.get_running_loop()
        return await loop.run_in_executor(None, _gtts)

    async def transcribe_audio(self, audio_bytes: bytes, filename: str = "audio.ogg") -> str:
        """Transcreve áudio usando faster-whisper (modelo local, sem API key)."""
        import asyncio
        import io
        import tempfile
        import os

        def _transcribe() -> str:
            try:
                from faster_whisper import WhisperModel
                # Cache global do modelo para evitar recarregar a cada mensagem
                if not hasattr(WhisperModel, "_cached_model"):
                    WhisperModel._cached_model = WhisperModel("tiny", device="cpu", compute_type="int8")
                model = WhisperModel._cached_model

                with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as f:
                    f.write(audio_bytes)
                    tmp_path = f.name

                try:
                    segments, info = model.transcribe(tmp_path, language="pt", beam_size=3)
                    text = " ".join(seg.text.strip() for seg in segments).strip()
                    return text if text else "[Áudio sem conteúdo reconhecível]"
                finally:
                    os.unlink(tmp_path)
            except Exception as e:
                logger.error("whisper_transcription_failed", error=str(e))
                return "[Não foi possível transcrever o áudio]"

        # Roda em thread separada para não bloquear o event loop
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, _transcribe)
        logger.info("audio_transcribed", length=len(text))
        return text

    async def process_document_media(
        self,
        media_bytes: bytes,
        mimetype: str,
        state: ConversationState,
    ) -> dict:
        """Processa imagem/PDF via IDP e retorna dados extraídos."""
        try:
            if mimetype == "application/pdf":
                extracted = await idp_service.extract_from_pdf(media_bytes)
            else:
                extracted = await idp_service.extract_from_image(media_bytes, mimetype)

            result = extracted.model_dump()
            state.collected_docs.append({
                "processed_at": datetime.utcnow().isoformat(),
                "document_type": result.get("document_type"),
                "issuer_name": result.get("issuer_name"),
                "total_value": result.get("total_value"),
                "issue_date": result.get("issue_date"),
                "confidence": result.get("confidence_score"),
                "data": result,
            })

            # Persiste no PostgreSQL via NestJS (alimenta o dashboard)
            import asyncio
            asyncio.create_task(save_document_to_db(state.company_id, result, source="whatsapp"))

            return result
        except Exception as e:
            logger.error("document_processing_failed", error=str(e))
            return {}

    def decide_next_stage(self, state: ConversationState, user_message: str) -> ConversationStage:
        """Decide o próximo estágio da conversa baseado no contexto."""
        msg_lower = user_message.lower()

        if state.stage == ConversationStage.GREETING:
            return ConversationStage.IDENTIFY

        if state.stage == ConversationStage.IDENTIFY:
            if state.client_name or any(w in msg_lower for w in ["sou", "meu nome", "empresa", "cnpj"]):
                return ConversationStage.COLLECT_DOCS

        if state.stage == ConversationStage.COLLECT_DOCS:
            if len(state.collected_docs) > 0 and any(
                w in msg_lower for w in ["pronto", "é isso", "só isso", "tudo", "terminei", "pode processar"]
            ):
                return ConversationStage.REVIEW

        if state.stage == ConversationStage.REVIEW:
            if any(w in msg_lower for w in ["ok", "certo", "obrigado", "valeu", "perfeito", "sim"]):
                return ConversationStage.COMPLETED

        return state.stage

    def extract_client_info(self, state: ConversationState, message: str) -> None:
        """Extrai nome e CNPJ do cliente da mensagem."""
        cnpj_match = re.search(r'\d{2}[\.\-]?\d{3}[\.\-]?\d{3}[\.\-/]?\d{4}[\.\-]?\d{2}', message)
        if cnpj_match:
            state.client_cnpj = re.sub(r'\D', '', cnpj_match.group())

        for phrase in ["meu nome é", "sou ", "me chamo "]:
            if phrase in message.lower():
                idx = message.lower().find(phrase) + len(phrase)
                name = message[idx:].split(',')[0].split('.')[0].strip().title()
                if 2 < len(name) < 60:
                    state.client_name = name
                    break


whatsapp_agent = WhatsAppAgent()
