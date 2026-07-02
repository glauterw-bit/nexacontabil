# Diagnóstico completo — NexaContábil × Mercado brasileiro (julho/2026)

> Elaborado em 02/07/2026. Base: auditoria do código real (backend 80+ módulos, frontend 60 telas),
> documentação interna, e pesquisa atualizada de legislação/mercado (fontes citadas ao longo).
> Substitui a leitura de abril (ANALISE_COMPLETA_ROADMAP.md) no que diz respeito a prioridades.

---

## 1. Sumário executivo

**Nota geral do sistema hoje: 7/10 como plataforma de OPERAÇÃO do escritório · 3/10 como sistema de ESCRITURAÇÃO/TRANSMISSÃO fiscal.**

Três conclusões que mudam tudo:

1. **O NexaContábil não precisa (nem deve) competir com o Domínio na escrituração.** O escritório já usa
   Domínio/Onvio (o sistema até exporta para ele). O posicionamento vencedor é ser a **camada de
   orquestração + inteligência** por cima: captura automática, semáforo da carteira, malha interna,
   faróis de risco, atendimento — exatamente o que Acessórias + Gestta + eRadar + IA fazem separados,
   e que a Thomson Reuters/Omie estão comprando caro para juntar (Gestta e G-Click foram adquiridos).

2. **O 2º semestre de 2026 tem quatro bombas com data marcada** (seção 4). A mais grave: a partir de
   **03/08/2026** notas de clientes do regime regular **serão rejeitadas pela SEFAZ** sem os campos
   IBS/CBS. E **01/09/2026** toda ME/EPP do Simples é obrigada à NFS-e nacional. O sistema hoje não
   monitora nenhuma das duas.

3. **Há erros regulatórios ativos no sistema** (seção 3): o gerador de calendário fiscal cria
   obrigações com datas e nomes de 2023 (FGTS dia 7 "GFIP" — o certo é dia 20 no FGTS Digital;
   DCTFWeb dia 15 — o certo é último dia útil). Para um produto cuja proposta é "não perder prazo",
   isso é o P0 absoluto.

---

## 2. O que o sistema TEM e funciona (auditado no código)

| Capacidade | Estado | Evidência |
|---|---|---|
| Captura de XMLs do drive (OneDrive/SharePoint) com parser local NF-e/CT-e/NFS-e e dedup | ✅ Real | `analise-cliente` (parse regex local, sem custo IA) |
| **Sincronização automática a cada 15 min** (XMLs novos, recibos, vencidas) | ✅ Real (02/07) | `sync-scheduler` |
| Semáforo da carteira por competência (docs + declaração + inconsistências) | ✅ Real | `paineis/operacao` + drawer explicável |
| Detecção de recibo de entrega no drive (inclui subpastas, retroativo) | ✅ Real | `fluxo.verificarRecibo` |
| Malha fina interna (inconsistências PIS/COFINS/IPI por nota, com "como corrigir" leigo) | ✅ Real | `inconsistencias`, `cliente-erros` |
| Faróis: sublimite Simples (RBT12), queda de faturamento, monofásico, concentração | ✅ Real | `paineis/farois` |
| Apuração por competência (receita, ICMS, PIS/COFINS, DAS por anexo/RBT12) | ✅ Real | `apuracao`, `simples-nacional` |
| Torre de controle (produção, SLA, funil 7 estágios, gargalo, carga por analista) | ✅ Real | `torre-controle` (ligado ao Gerencial) |
| Health score do cliente (6 dimensões) | ✅ Real | `health-score` |
| Calendário fiscal por regime + mark-overdue automático | ⚠️ Real mas **datas errradas** (seção 3) | `fiscal-calendar` |
| Atendimento unificado (WhatsApp/e-mail vira ticket) | ✅ Real | `atendimentos` |
| IA (Claude): OCR de documentos, insights por cliente, busca em linguagem natural | ✅ Real c/ fallback | `documents`, `insights`, `busca-docs` |
| Exportação para Domínio | ✅ Real | `exportar-dominio` |
| RBAC + 2FA TOTP + LGPD art. 18 + trilha hash-chain | ✅ Real | `auth`, `two-factor`, `lgpd`, `audit` |
| Emissão NF-e/NFS-e | ❌ Stub (NFe.io integrado sem credencial) | `nfe`, `nfse` |
| eSocial / SPED / EFD-Reinf / DCTFWeb — **transmissão** | ❌ Estrutura sem assinatura/webservice real | `esocial`, `sped` |
| Open Finance, boletos, benchmark setorial, predictive | ❌ Stub/mock | — |

**Leitura honesta**: o que funciona é exatamente o que o mercado de "satélites" cobra caro
(Acessórias/Gestta/Qive/SIEG/eRadar). O que não funciona é o que o Domínio já faz para o escritório.
Não é um defeito — é a definição do produto.

---

## 3. Erros e desatualizações ATIVOS no sistema (corrigir já)

1. **Gerador de calendário fiscal com regras de 2023** (`fiscal-calendar.service.ts`):
   - FGTS gerado como "GFIP / FGTS" **dia 7** → correto: **FGTS Digital, dia 20**, pago via Pix
     (GFIP/Conectividade Social extintos desde mar/2024; processos trabalhistas via FGTS Digital desde mai/2026).
   - DCTFWeb gerada **dia 15** → correto desde 2025: **último dia útil do mês seguinte** (IN RFB 2.237/2024),
     e o conceito novo do **MIT** (IRPJ/CSLL/PIS/COFINS entram por ele) não existe no sistema.
   - Não gera alerta da **multa nova do PGDAS-D** (2%/mês por atraso após dia 20 — vigente desde 01/01/2026).
   - Conferir se não há resíduo de **DIRF** em telas/textos (extinta; última entrega foi fev/2025).
2. **Zero suporte à Reforma Tributária nos dados**: o parser de XML não lê o **grupo UB (gIBSCBS)**,
   `cClassTrib`, CST de IBS/CBS (NT 2025.002 v1.10+); as tabelas cClassTrib/cCredPres **v1.60**
   (implantação até 10/07/2026) não existem no motor tributário. Sem isso, a partir de agosto o
   sistema fica cego para o dado fiscal mais importante das notas dos clientes de regime regular.
3. **eSocial referencia eventos sem versão de leiaute**: vigente é o **S-1.3** com NT 06/2026 em
   produção desde 27/04/2026 (processos trabalhistas S-2500/S-2501). Como não há transmissão real,
   o risco é menor — mas os textos/telas não devem sugerir capacidade que não existe.

---

## 4. Agenda regulatória crítica — 2º semestre/2026 (o que o gestor precisa na parede)

| Data | O quê | Quem afeta | O sistema cobre? |
|---|---|---|---|
| **31/07/2026** | **ECF ano-calendário 2025 (leiaute 12)** — vence este mês | Clientes Lucro Real/Presumido | Item de calendário genérico; sem validação |
| **03/08/2026** | **DF-e sem campos IBS/CBS passam a ser REJEITADOS** (fim do período educativo — Ato Conjunto RFB/CGIBS 1/2025 + Decreto 12.955/2026 + Res. CGIBS 6/2026) | Todos os clientes do **regime regular** (CRT 3) que emitem NF-e/NFC-e/NFS-e/CT-e | ❌ Nenhum farol |
| **01/09/2026** | **NFS-e padrão nacional obrigatória para TODAS as ME/EPP do Simples** via Emissor Nacional (Res. CGSN 189/2026) | Praticamente a carteira inteira do escritório | ❌ Nenhum farol |
| **Set/2026** | **Janela de opção do regime híbrido do Simples** (IBS/CBS "por fora" do DAS) — a escolha de setembro vale para jan–jun/2027; gera crédito integral p/ clientes B2B | Clientes Simples que vendem B2B | ❌ Nenhum simulador |
| Mensal desde jan/2026 | **IRRF 10% sobre dividendos > R$ 50 mil/mês por PF** (Lei 15.270/2025), escriturado no **R-4010** | Sócios de clientes lucrativos | ❌ Não monitora distribuições |
| Mensal | PGDAS-D até dia 20 (multa 2%/mês nova) · DCTFWeb último dia útil · FGTS dia 20 · Reinf dia 15 | Todos | ⚠️ Datas errradas (seção 3) |
| 2027 (preparar em Q4/26) | Extinção PIS/COFINS · CBS alíquota cheia (~9,3%) · Imposto Seletivo · split payment facultativo · Simples/MEI passam a destacar IBS/CBS (04/01/2027) | Todos | ❌ |

Contexto de fiscalização: a RFB autuou **R$ 233 bi em 2025** e declarou 2026 como ano de
**autorregularização** — 101 mil avisos de malha PJ digital em 2025. Monitorar a **caixa postal
e-CAC** dos clientes deixou de ser opcional. Nota também: IN RFB 2.320/2026 trocou a procuração
eletrônica pela **"Autorização de Acesso"** (contador precisa ACEITAR no sistema — revisar onboarding).

---

## 5. Posicionamento de mercado (onde ganhar)

**O mercado em números**: ~101 mil escritórios ativos (+41% em 4 anos), 538 mil profissionais;
**48% dos contadores se declaram despreparados para a reforma** e **80% dos pequenos empresários
ainda não foram abordados pelo contador sobre ela** (Sondagem Omie); **81% das empresas com
dificuldade de contratar** — automação virou necessidade, não luxo.

**Concorrência direta do que o Nexa faz bem** (orquestração/satélites):
- Acessórias, Gestta (hoje Thomson Reuters), Omie.G-Click — gestão de obrigações/tarefas; preço por faixa de empresas.
- Qive (ex-Arquivei) R$ 39,90–299,90/mês e SIEG — captura de XML; **a captura é commodity**: o
  webservice NFeDistribuicaoDFe da SEFAZ é gratuito e o Integra Contador do SERPRO custa centavos
  (~R$ 0,96/DAS emitido, ~R$ 0,75/DCTFWeb transmitida). O valor está na orquestração + alerta.
- eRadar/eContador (Alterdata) — robô e-CAC + portal + bot WhatsApp: é o comparável mais próximo do
  conjunto Nexa (atendimento + vigilância + portal).
- IA dos líderes ainda é assistente de suporte + classificação (TRIA, Questor IA, Makro GI).
  **Nenhum player nacional entrega hoje IA agêntica sobre os dados do escritório** — a arquitetura
  do Nexa (Claude sobre XMLs + carteira + faróis) está à frente nesse recorte.

**Referências de preço para o modelo de negócio**: Domínio ~R$ 1.300/mês (5 usuários, relato),
Makro R$ 195/mês (piso), satélites cobram por CNPJ. Honorários médios (SESCON-SP) R$ 706–1.412/mês
por cliente pequeno — cada hora de analista economizada é margem direta.

---

## 6. Plano de ação priorizado

### P0 — Este mês (julho/2026) · proteger o escritório
1. **Corrigir o gerador de calendário fiscal**: FGTS→dia 20 (FGTS Digital), DCTFWeb→último dia útil,
   criar item MIT, remover "GFIP", alerta PGDAS com aviso da multa de 2%. Regerar 2026 da carteira.
2. **Farol "ECF 31/07"**: listar clientes Lucro Real/Presumido sem ECF entregue (recibo no drive).
3. **Farol "IBS/CBS 03/08"**: para clientes de regime regular, checar nos XMLs mais recentes se o
   emissor já preenche o grupo UB/cClassTrib; quem não preenche vai parar de faturar em 03/08 —
   lista de ligação urgente para o gestor.
4. **Farol "NFS-e nacional 01/09"**: marcar toda a carteira Simples prestadora de serviço que ainda
   emite em sistema municipal próprio; gerar mensagem de WhatsApp pronta (o módulo `solicitacoes` já
   tem esse padrão) orientando a migração ao Emissor Nacional.

### P1 — 90 dias (ago–out/2026) · transformar a reforma em receita
5. **Simulador do regime híbrido do Simples** (decisão até setembro): para cada cliente Simples,
   cruzar % de vendas B2B (dos XMLs, por CNPJ do destinatário) e simular crédito gerado ao cliente
   dele no híbrido vs DAS puro. É um produto consultivo vendável por cliente — e a janela é agora.
6. **Ler IBS/CBS dos XMLs** (grupo UB, cClassTrib, tabelas v1.60) e criar a visão "carga dual"
   (tributação atual × IVA teste) — insumo do planejamento 2027 e diferencial vs concorrentes.
7. **Integra Contador (SERPRO)**: emitir DAS, transmitir DCTFWeb e puxar caixa postal e-CAC por
   centavos — elimina o gargalo manual mais odiado e habilita a "vigia tributária" (autorregularização).
8. **Monitor de dividendos**: alertar distribuição > R$ 50 mil/mês por sócio PF (IRRF 10% + R-4010).

### P2 — Q4/2026 → 2027 · preparar a virada
9. Preparação 2027: Simples/MEI passam a destacar IBS/CBS em 04/01/2027; extinção PIS/COFINS;
   split payment facultativo (conciliação "recebido ≠ faturado" — a plataforma pública já tem
   manual/Swagger publicados em 03/06/2026).
10. Portal do cliente com magic link + checklist do mês (reduz churn; padrão TaxDome/Onvio Portal).
11. BPO financeiro como módulo (tendência nº 1 de receita nova de escritórios em 2026).
12. Emissão fiscal real via NFe.io/Focus só quando houver demanda de cliente emitindo pelo sistema
    (hoje o Domínio cobre; não é gargalo).

---

## 7. Modelo de receita sugerido para o escritório (além do honorário)

| Produto | Base no sistema | Preço de referência |
|---|---|---|
| Análise do regime híbrido (por cliente B2B do Simples) | Item P1.5 | R$ 300–800 one-off (janela set/2026) |
| Planejamento de dividendos 2026 (Lei 15.270) | Item P1.8 | R$ 500–1.500 por sócio/ano |
| "Vigia tributária" (e-CAC + CNDs + malha monitorados) | Item P1.7 | +R$ 50–150/mês no honorário |
| Relatório mensal de saúde com IA (já existe o health score) | `health-score` + `insights` | Embutido para fidelizar |
| BPO financeiro | Item P2.11 | 1,5–3× o honorário contábil |

---

*Fontes principais: Receita Federal (Orientações 2026, balanço fiscalização), CGIBS (comunicado
15/06/2026 — rejeição 03/08), LC 214/2025, LC 227/2026, Decreto 12.955/2026, Res. CGIBS 6/2026,
Res. CGSN 189/2026 (NFS-e Simples 01/09), Lei 15.270/2025 (dividendos), IN RFB 2.237/2024 (DCTFWeb),
IN RFB 2.181/2024 (fim da DIRF), NT 2025.002 v1.10 / NT 007/2026 / NT 2026.002, portal FGTS Digital,
Sondagem Omie 2025, CFC, SESCON-SP, Loja SERPRO (Integra Contador), sites/imprensa dos concorrentes.*
