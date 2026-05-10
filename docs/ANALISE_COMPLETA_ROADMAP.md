# NEXACONTABIL / AURA ACCOUNTING
## Análise Profunda de Lacunas + Roadmap para o Sistema Contábil mais Inovador do Mundo

> Análise realizada em 05/04/2026 — baseada no código atual do sistema

---

## DIAGNÓSTICO: O QUE JÁ EXISTE

### Módulos Implementados (MVP)
| Módulo | Status | Observação |
|---|---|---|
| Autenticação (JWT) | ✅ Funcional | Falta 2FA, SSO, login gov.br |
| Empresas (multiempresa) | ✅ Funcional | Falta CNPJ lookup automático |
| Transações contábeis | ✅ Funcional | Lançamentos com IA de classificação |
| Notas fiscais | ⚠️ Stub | Emissão simulada — sem SEFAZ real |
| Folha de pagamento | ⚠️ Parcial | INSS/IRRF calculados, sem eSocial |
| Relatórios (DRE/Balanço) | ✅ Funcional | Sem SPED, sem ECF |
| Conciliação bancária | ✅ Funcional | Sem Open Finance real |
| Boletos | ⚠️ Stub | Sem integração bancária real |
| Documentos (IDP) | ✅ Funcional | Captura XML via WhatsApp |
| Copiloto IA (Aura) | ✅ Funcional | Claude + contexto contábil |
| Agenda/Obrigações | ✅ Funcional | Sem envio automático ao cliente |
| Assinaturas digitais | ✅ Funcional | Sem ICP-Brasil |
| Banking OFX | ✅ Funcional | Sem Open Finance |
| Saúde Fiscal | ✅ Funcional | Dashboard de indicadores |
| WhatsApp IA | ✅ Funcional | Atendente contábil com anti-ban |
| Auditoria | ✅ Funcional | Log de ações |

---

## PARTE 1 — LACUNAS CRÍTICAS (SEM AS QUAIS O ESCRITÓRIO NÃO FUNCIONA)

### 1.1 NF-e / NFC-e / NFS-e — EMISSÃO REAL NA SEFAZ
**Situação atual:** Stub que gera chave aleatória de 44 dígitos. **Não transmite nada.**

**O que falta:**
- Integração real com SEFAZ via API (NFe.io, Plugnotas ou Focus NFe)
- Assinatura digital do XML com certificado A1/A3
- Transmissão, retorno e armazenamento do XML autorizado
- Cancelamento e Carta de Correção (CC-e)
- Consulta de status na SEFAZ
- Contingência (SCAN/SVC) quando SEFAZ fora do ar
- Geração de DANFE (PDF) após autorização
- Download automático de XMLs de fornecedores via SEFAZ (manifestação)
- NFS-e por município (cada prefeitura tem API diferente — ver item 2.3)

**Impacto:** Sem isso, o escritório **não pode usar o sistema para nenhum cliente** que emita nota.

---

### 1.2 eSocial — COMPLETAMENTE AUSENTE
**Situação atual:** Folha calcula INSS/IRRF/FGTS mas não transmite nada ao governo.

**O que falta:**
- Módulo eSocial completo com todos os eventos:
  - **S-1000** — Informações do Empregador
  - **S-1005** — Tabela de Estabelecimentos
  - **S-1010** — Tabela de Rubricas
  - **S-1020** — Tabela de Lotações Tributárias
  - **S-1030** — Tabela de Cargos
  - **S-2200** — Cadastramento Inicial do Vínculo (admissão)
  - **S-2205** — Alteração de Dados Cadastrais
  - **S-2206** — Alteração de Contrato de Trabalho
  - **S-2210** — Comunicação de Acidente de Trabalho (CAT)
  - **S-2220** — Monitoramento de Saúde do Trabalhador
  - **S-2230** — Afastamento Temporário
  - **S-2240** — Condições Ambientais do Trabalho
  - **S-2299** — Desligamento
  - **S-2300** — Trabalhador Sem Vínculo (autônomo, RPA)
  - **S-2400** — Cadastro de Benefícios Previdenciários
  - **S-1200** — Remuneração do Trabalhador (mensal)
  - **S-1210** — Pagamentos de Rendimentos do Trabalho
  - **S-1299** — Fechamento dos Eventos Periódicos
  - **S-5001** — Contribuições por Trabalhador (retorno)
  - **S-5002** — Imposto de Renda Retido na Fonte
  - **S-5003** — Contribuição Solidária (retorno)
  - **S-5011** — Informações das Contribuições Sociais
  - **S-5013** — IRRF Consolidado
- Assinatura digital dos eventos (certificado A1/A3)
- Transmissão via webservice SOAP do eSocial (ambiente produção e homologação)
- Retorno e processamento dos recibos de entrega
- Consulta de lote e status de eventos
- Dashboard de inconsistências e pendências
- Geração automática de eventos a partir da folha calculada

**Impacto:** Sem eSocial, o escritório não pode gerir nenhum funcionário CLT legalmente.

---

### 1.3 EFD-REINF — AUSENTE
**O que falta:**
- Eventos R-1000 a R-9015
- Integração com SPED
- Retenções sobre NF de serviços
- Contribuições sociais sobre receita bruta
- Transmissão para a Receita Federal
- Fechamento e reabertura de períodos

---

### 1.4 DCTFWeb — AUSENTE
**O que falta:**
- Declaração de Débitos e Créditos Tributários Federais
- Apuração automática a partir do eSocial + EFD-Reinf
- Geração do DARF para recolhimento
- Retificação de declarações anteriores
- Integração com eCAC para transmissão

---

### 1.5 SPED Fiscal (EFD ICMS/IPI) — AUSENTE
**O que falta:**
- Registros: 0000, 0001, 0005, 0100, 0150, 0190, 0200, 0450, 0990
- Bloco C: Documentos fiscais (NF-e entrada e saída)
- Bloco D: Documentos de transporte
- Bloco E: Apuração de ICMS e IPI
- Bloco G: Controle de CIAP
- Bloco H: Inventário físico
- Bloco K: Controle da produção e estoque
- Bloco 1: Outras informações
- Validação com PVA (Programa Validador da SEFAZ)
- Transmissão estadual

---

### 1.6 SPED Contribuições (EFD-PIS/COFINS) — AUSENTE
**O que falta:**
- Bloco A: Documentos de serviços
- Bloco C: NFs de produto
- Bloco D: Documentos de transporte
- Bloco F: Demais documentos e operações
- Bloco M: Apuração PIS e COFINS
- Bloco P: Contribuição previdenciária sobre receita bruta
- Créditos fiscais e não-cumulatividade
- Regimes: Lucro Real (não cumulativo) e Lucro Presumido (cumulativo)

---

### 1.7 ECF (Escrituração Contábil Fiscal) — AUSENTE
**O que falta:**
- Bloco 0: Abertura e identificação
- Bloco C: Identificação das contas
- Bloco E: DRE + dados econômicos
- Bloco J: Balanço patrimonial e DRE
- Bloco K: Saldos contábeis
- Bloco L: Lucro líquido e ajustes
- Bloco M: LALUR e LACS
- Bloco N: Cálculo do IRPJ e CSLL
- Bloco P: Participações no lucro e deduções
- Bloco Q: Identificação dos sócios
- Bloco V: Variações do patrimônio líquido
- Bloco X: Informações econômicas
- Bloco Y: Informações gerais

---

### 1.8 ECD (Escrituração Contábil Digital) — AUSENTE
**O que falta:**
- Livro Diário Digital
- Livro Razão Digital
- Balancetes e balanços
- Autenticação na Junta Comercial
- Transmissão ao SPED Contábil (Receita Federal)

---

### 1.9 PGDAS-D / Simples Nacional — AUSENTE
**O que falta:**
- Apuração mensal do DAS (Documento de Arrecadação do Simples)
- Cálculo por Anexos (I ao V) e Faixas de Receita Bruta
- Sublimites estaduais para ISS e ICMS
- Geração do PGDAS-D para transmissão no portal do Simples
- Controle de RBT12 (Receita Bruta dos últimos 12 meses)
- Alerta de desenquadramento por excesso de receita
- Cálculo das repartições por ente (Receita Federal, Estado, Município)

---

### 1.10 DIRF (Declaração de IR Retido na Fonte) — AUSENTE
**O que falta:**
- Apuração de retenções sobre pagamentos a PF e PJ
- Beneficiários de rendimentos
- Geração do arquivo DIRF para entrega na RFB
- Integração com folha e pagamentos a autônomos

---

## PARTE 2 — INTEGRAÇÕES GOVERNAMENTAIS FEDERAIS

### 2.1 Receita Federal do Brasil (RFB)

| Integração | Finalidade | Protocolo |
|---|---|---|
| **SEFAZ Nacional** | NF-e, NFC-e, CT-e, MDF-e | SOAP/XML com certificado digital |
| **eSocial** | Gestão de vínculos trabalhistas | SOAP + REST (fase 4) |
| **EFD-Reinf** | Retenções e contribuições | SOAP |
| **DCTFWeb** | Declaração unificada | eCAC via certificado |
| **ECF** | IRPJ/CSLL (Lucro Real) | SPED PVA + transmissão |
| **ECD** | Escrituração contábil digital | SPED PVA + transmissão |
| **DIRF** | IR retido na fonte | PGD DIRF |
| **DCTF** | Débitos e créditos federais (legado) | PGD DCTF |
| **SIOPE** | Saúde — municípios | Portal SIOPE |
| **eCAC** | Consulta de situação fiscal | Certificado A1/A3 |
| **Consulta CNPJ** | Dados cadastrais | API Receita WS (gratuita) |
| **Consulta CPF** | Validação cadastral | API Serpro (paga) |
| **CNAE** | Código de atividade | Tabela IBGE |
| **Simples Nacional (PGDAS)** | Apuração mensal DAS | Portal Simples |
| **Parcelamento RFB** | PARCELAMENTO online | eCAC |
| **Certidão Negativa Federal** | CND federal | API RFB |

---

### 2.2 Integrações Estaduais (SEFAZ Estaduais)

| Integração | Finalidade |
|---|---|
| **NF-e por UF** | Autorização, cancelamento, inutilização, consulta |
| **CT-e** | Conhecimento de Transporte Eletrônico |
| **MDF-e** | Manifesto Eletrônico de Documentos Fiscais |
| **EFD ICMS/IPI** | SPED Fiscal estadual |
| **GIA/GIA-ST** | Guia de Informação e Apuração do ICMS |
| **DIFAL** | Diferencial de alíquota ICMS (EC 87/2015) |
| **GNRE** | Guia Nacional de Recolhimento Estadual |
| **Certidão Negativa Estadual** | CND estadual por UF |
| **CAT** | Comunicação de acidente de trabalho (estadual) |
| **SINTEGRA** | Dados de contribuintes (consulta) |
| **Consulta inscrição estadual** | Validação do IE do cliente/fornecedor |

**Particularidade:** Cada estado tem URL, schema e regras diferentes. O sistema precisa de um **motor tributário por UF** com regras de:
- Alíquota interna e interestadual
- Substituição tributária (ST) por produto/NCM/UF
- Redução de base de cálculo
- Isenções e benefícios fiscais por UF
- Fundo de combate à pobreza (FECP, FECOP, etc.)

---

### 2.3 Integrações com Prefeituras (NFS-e)

Este é o maior desafio porque **cada município tem sua própria API ou portal**. Os principais padrões:

| Padrão | Municípios | Protocolo |
|---|---|---|
| **ABRASF** | São Paulo, Belo Horizonte e +200 | SOAP/XML padrão |
| **Betha** | Municípios do Sul | SOAP próprio |
| **Governa** | Vários municípios | REST próprio |
| **ISS.net** | Vários municípios | SOAP |
| **Equiplano** | Vários municípios | SOAP |
| **Tributus** | Vários municípios | REST |
| **GIF Municipal** | Vários municípios | SOAP |
| **Portal próprio** | Municípios grandes (RJ, Manaus) | REST/SOAP próprio |

**Solução recomendada:** Integrar com agregadores de NFS-e:
- **NFe.io** — cobre +600 municípios
- **Focus NFe** — cobre +400 municípios  
- **Nota.com.br** — alternativa

**O que o sistema precisa:**
- Cadastro do município do prestador com detecção automática do padrão
- Emissão de NFS-e com tributação ISS automática
- Cancelamento de NFS-e
- Consulta de RPS (Recibo Provisório de Serviços)
- Download e armazenamento do XML retornado
- Geração do DANFSE (documento auxiliar)
- Apuração mensal do ISS para recolhimento à prefeitura
- Guia de recolhimento do ISS (GISS)

---

### 2.4 Ministério do Trabalho e Emprego (MTE)

| Integração | Finalidade |
|---|---|
| **CAGED** (via eSocial) | Admissões e demissões |
| **RAIS** | Relação Anual de Informações Sociais |
| **CAT** | Comunicação de Acidente de Trabalho |
| **eSocial** | Substitui CAGED, RAIS e outros |
| **Conselho Regional (CRC/OAB/etc.)** | Validação de profissionais |

---

### 2.5 Previdência Social / INSS

| Integração | Finalidade |
|---|---|
| **INSS Online** | Consulta de contribuições por CPF |
| **Carta de Concessão** | Aposentadoria e benefícios |
| **CNIS** | Cadastro Nacional de Informações Sociais |
| **GPS** | Guia de Recolhimento do FGTS e INSS (legado) |
| **DARF** | Recolhimento federal (geração e validação) |

---

### 2.6 FGTS / Caixa Econômica Federal

| Integração | Finalidade |
|---|---|
| **FGTS Digital** | Novo sistema (substituiu SEFIP/GFIP) |
| **GFIP** (legado) | Informações para FGTS (ainda necessário) |
| **Rescisão** | TRCT e guia de saque FGTS |
| **Conectividade Social** | Canal de transmissão Caixa |

---

### 2.7 Banco Central / Open Finance

| Integração | Finalidade |
|---|---|
| **Open Finance Brasil** | Importação automática de extratos bancários |
| **PIX API** | Recebimento e pagamento PIX |
| **DICT** | Consulta de chaves PIX |
| **STR/SILOC** | Transferências bancárias |
| **Conciliação OFX** | Extrato bancário padrão OFX/OFXBR |
| **Boleto Registrado** | Compensação Bancária (via FEBRABAN) |

---

## PARTE 3 — MÓDULOS QUE FALTAM NO SISTEMA

### 3.1 Módulo Fiscal Completo
- **Motor Tributário por NCM:** Alíquotas de IPI, PIS, COFINS, ICMS por produto e operação
- **Tabela NCM completa** com pesquisa e sugestão por IA
- **CFOP automático** por tipo de operação (saída, entrada, devolução, transferência, brinde)
- **Classificação fiscal de produtos** com validação de NCM
- **Apuração de ICMS** — por regime (débito/crédito, ST, DIFAL)
- **Apuração de PIS/COFINS** — cumulativo e não-cumulativo
- **Apuração de IPI** — por produto e saída tributada
- **Livro de Entradas e Saídas** digital com exportação
- **Livro de Apuração do ICMS** (LAICMS)
- **Registro de inventário** para SPED
- **Manifestação de NF de fornecedor** (ciência, confirmação, desconhecimento, operação não realizada)
- **Download automático de XMLs** de fornecedores via e-mail SEFAZ
- **Carta de correção eletrônica (CC-e)**
- **Inutilização de numeração de NF**
- **NF de entrada** (importação de XML)
- **NF de devolução** automática

---

### 3.2 Módulo Trabalhista Completo
- **Férias** — cálculo, agendamento, recibo de férias, provisão contábil
- **13º Salário** — 1ª e 2ª parcelas com cálculo e provisão
- **Rescisão** — todos os tipos (sem justa causa, com justa causa, pedido de demissão, acordo)
- **Horas extras** — banco de horas, DSR, adicional noturno
- **Ponto eletrônico** — integração com relógios de ponto (AFD)
- **Médico do trabalho (ASO)** — controle de exames admissionais, periódicos, demissionais
- **PPP** (Perfil Profissiográfico Previdenciário)
- **LTCAT** (Laudo Técnico das Condições Ambientais)
- **Controle de afastamentos** — atestados, INSS, licença maternidade
- **Aviso prévio** — proporcional e indenizado
- **CAGED** — movimentações de empregados
- **RAIS** — entrega anual
- **GRF** (Guia de Recolhimento do FGTS)
- **RPA** (Recibo de Pagamento a Autônomo) com retenções
- **Pró-labore** — cálculo e retenções dos sócios
- **Adiantamento de salário**
- **Vale transporte** e **vale refeição**
- **PLR** (Participação nos Lucros e Resultados)

---

### 3.3 Módulo de Obrigações Acessórias Completo
O sistema tem uma tela de obrigações mas sem automação real. Precisa:

- **Calendário fiscal automático** gerado por empresa/regime/atividade
- **DCTF mensal** — débitos e créditos tributários federais
- **GIA** — por estado do cliente
- **DEFIS** — declaração de informações do Simples Nacional
- **DASN-SIMEI** — MEI
- **DES** — declaração eletrônica de serviços (municipal)
- **SINTEGRA** — arquivo magnético estadual
- **DMED** — planos de saúde
- **DIMOB** — operações imobiliárias
- **DOI** — operações imobiliárias (cartório)
- **DBF** — declaração de benefícios fiscais
- **Denúncia espontânea** — cálculo de multa e juros
- **Controle de parcelamentos** — REFIS, PERT, parcelamento ordinário
- Alerta automático **por WhatsApp/email** ao responsável da empresa cliente
- Comprovante de entrega armazenado automaticamente

---

### 3.4 Módulo de CRM Contábil (Relacionamento com Clientes)
Hoje o sistema foca nas empresas que são **clientes do escritório**, mas falta:

- **Portal do Cliente** — acesso exclusivo onde o cliente:
  - Envia documentos, notas e extratos
  - Vê seus relatórios e demonstrativos
  - Aprova documentos com assinatura digital
  - Acompanha obrigações do mês
  - Faz perguntas à IA contábil
  - Baixa suas guias de pagamento (DARF, DAS, GPS)
- **Contrato de prestação de serviços** — geração e assinatura digital
- **Precificação de honorários** — por faixa de faturamento ou por módulos
- **Cobrança automática** de honorários com PIX e boleto
- **NPS** — pesquisa de satisfação pós-entrega
- **Pipeline de prospecção** — novos clientes em negociação
- **Onboarding digital** — checklist de documentos para abertura de empresa
- **Abertura de empresa** — geração de contrato social, consulta de viabilidade

---

### 3.5 Módulo de Gestão de Contratos e Honorários
- Tabela de honorários por tipo de serviço
- Reajuste anual por IGPM/IPCA automático
- Controle de inadimplência com régua de cobrança
- Proposta comercial gerada por IA
- Contrato digital com assinatura (ICP-Brasil)
- Split de honorários entre sócios do escritório

---

### 3.6 Módulo de Planejamento Tributário
- Comparativo entre regimes (Simples × Lucro Presumido × Lucro Real)
- Simulação de carga tributária atual vs. alternativa
- Relatório de planejamento tributário em PDF para o cliente
- Identificação de créditos tributários não aproveitados
- Alerta de mudança de regime no início do ano-calendário
- Holding e planejamento patrimonial básico

---

### 3.7 Módulo de Abertura e Encerramento de Empresas
- **Consulta de viabilidade** — CNPJ nome empresarial na Junta Comercial
- **Contrato Social** — geração automatizada
- **DBE** (Documento Básico de Entrada) — Receita Federal
- **Inscrição municipal** — formulário por município
- **Inscrição estadual** — por UF
- **CNPJ** — consulta e acompanhamento de status
- **Alteração contratual** — mudança de sócios, endereço, atividade
- **Encerramento** — baixa de CNPJ com checklist completo
- **Junta Comercial** — integração com REDESIM (rede nacional)

---

### 3.8 Módulo de Patrimônio e Imobilizado
- Cadastro de bens com valor, vida útil e depreciação
- **Cálculo de depreciação** — linear, acelerada, por taxa
- **CIAP** — Controle de Crédito de ICMS sobre ativo permanente
- **Reavaliação de ativos** e impairment
- **Baixa de ativo** com apuração de ganho/perda
- Exportação para SPED Bloco G

---

### 3.9 Módulo de Custos e CMV
- **Custo dos produtos vendidos** (CMV) automático
- **Custeio por absorção e variável**
- **Centro de custos** — rateio por critério (horas, área, receita)
- **Orçamento vs. realizado** (budget)
- **Variações de orçamento** com alertas
- **Inventário periódico e permanente**
- **Lote e PEPS/UEPS/Médio Ponderado** para valoração de estoque

---

### 3.10 Módulo de Auditoria Interna e Compliance
- **Checklist de auditoria** por área
- **Evidências** — anexo de documentos por ponto auditado
- **Relatório de auditoria** gerado por IA
- **Matriz de risco** — probabilidade × impacto
- **Controles internos** — mapeamento e avaliação
- **SOX básico** — segregação de funções
- **LGPD** — mapeamento de dados pessoais e relatório de impacto (DPIA)

---

## PARTE 4 — CAPTURA INTELIGENTE DE DOCUMENTOS (ALÉM DO ATUAL)

### 4.1 Captura de XMLs de NF-e

**Hoje:** O sistema recebe XMLs via WhatsApp (IDP). Falta:

- **Monitoramento automático de e-mail** — monitora caixa de entrada e extrai XMLs de NF-e automaticamente (IMAP/Gmail API/Outlook API)
- **Download automático via SEFAZ** — consulta a SEFAZ pelo CNPJ do cliente e baixa todas as NFs emitidas contra ele (endpoint de manifestação)
- **Pasta compartilhada** — cliente faz upload em pasta Google Drive/OneDrive e o sistema processa automaticamente
- **App mobile** — câmera do celular fotografa nota e extrai dados (OCR + IA)
- **Portal do cliente** — upload direto no portal
- **Integração com e-mail da SEFAZ** — muitos estados enviam XML por e-mail automaticamente
- **EDI de distribuidores** — importação de NFs via EDI ou API do fornecedor
- **Extrato bancário OFX** — upload e classificação automática por IA
- **PDF inteligente** — extrai dados de PDFs de boletos, extratos, contratos

### 4.2 Validação de XMLs
- Assinatura digital (verificação do certificado)
- Schema XSD da NF-e (validação estrutural)
- Chave de acesso (dígito verificador)
- Consulta de status na SEFAZ (se realmente autorizada)
- Detecção de NF cancelada ou denegada
- Conferência de valores (totalização dos itens × total da nota)
- Alerta de CNPJ emitente inválido ou em situação irregular

---

## PARTE 5 — INTEGRAÇÕES DE MERCADO (NÃO GOVERNAMENTAIS)

### 5.1 Bancos e Financeiras
| Banco | Integração | Finalidade |
|---|---|---|
| Bradesco | Open Banking API | Extrato, saldo, pagamentos |
| Itaú | Open Banking API | Extrato, saldo |
| Santander | Open Banking API | Extrato, conciliação |
| BB | API BB Developer | Boleto, PIX, extrato |
| Caixa | Conectividade Social | FGTS, boleto |
| Sicoob/Sicredi | Open Banking | Cooperativas |
| Nubank/Inter | Open Banking | Conta PJ digital |
| **Open Finance (padrão)** | Bacen | Todos os bancos participantes |

### 5.2 Certificado Digital
| Provedor | Finalidade |
|---|---|
| **Certisign** | Emissão e renovação de A1/A3 |
| **Serasa** | A1/A3 |
| **Valid** | A1/A3 |
| **SafeID** | Nuvem — certificado em nuvem (sem token físico) |
| **BirdID** | Certificado em nuvem mais adotado |
| **VaultID** | Alternativa nuvem |

**O sistema precisa:**
- Armazenamento seguro do certificado A1 (criptografado no banco)
- Renovação com alerta antecipado (30/15/7 dias)
- Suporte a certificado em nuvem (BirdID/VaultID via OAuth)
- Assinatura de documentos com carimbo de tempo (TSA)

### 5.3 Comunicação com Clientes
| Plataforma | Finalidade |
|---|---|
| **WhatsApp Business API** | Já existe — expandir para portal do cliente |
| **E-mail transacional (Resend)** | Envio de relatórios, guias, alertas |
| **SMS (Twilio/Total Voice)** | Alertas críticos (vencimentos, problemas) |
| **Telegram Bot** | Canal alternativo para alguns clientes |
| **Portal Web** | Principal canal de comunicação estruturada |

### 5.4 Assinatura Digital
| Plataforma | Finalidade |
|---|---|
| **DocuSign** | Contratos com clientes internacionais |
| **D4Sign** | Assinatura com validade jurídica no Brasil |
| **ClickSign** | Alternativa nacional |
| **Autentique** | Mais barato, integração fácil |
| **ICP-Brasil nativo** | Assinatura com certificado digital — valor probatório máximo |

### 5.5 Contabilidade e ERP de Clientes
| Sistema | Integração | Finalidade |
|---|---|---|
| **TOTVS Protheus** | API REST | Importar lançamentos de clientes grandes |
| **SAP** | API SAP | Clientes enterprise |
| **Omie** | API Omie | Clientes PME que usam Omie |
| **Conta Azul** | API | PME |
| **Bling** | API | E-commerce + estoque |
| **Nibo** | API | Concorrente direto — importar clientes |
| **QuickBooks** | API | Empresas internacionais |

---

## PARTE 6 — IA E INOVAÇÕES QUE TORNARÃO O SISTEMA ÚNICO NO MUNDO

### 6.1 Aura IA — Expansão do Copiloto Atual

O copiloto atual responde perguntas. Precisa evoluir para:

**Aura Proativa (não espera ser perguntada):**
- Toda segunda-feira envia relatório executivo ao contador com as 5 prioridades da semana
- Detecta automaticamente inconsistências nos lançamentos e alerta
- Compara carga tributária atual com benchmark do setor (CNAE)
- Identifica créditos de PIS/COFINS não aproveitados
- Detecta NFs de fornecedor não lançadas (compara XML recebido com lançamentos)
- Alerta sobre obrigações vencendo nos próximos 5 dias úteis
- Sugere reclassificação de lançamentos com base no padrão da empresa

**Aura Fiscal:**
- Gera minutas de defesas administrativas (impugnações)
- Explica autuações fiscais em linguagem simples
- Sugere argumentos para contestação com base na jurisprudência
- Pesquisa soluções de consulta da RFB (SISCOSERV, COSIT)

**Aura Trabalhista:**
- Calcula rescisão com todos os verbas automaticamente
- Explica diretos do empregado em caso de dúvida
- Detecta inconsistências na folha (funcionário acima do teto INSS, etc.)
- Gera e-mails para comunicar empregados

**Aura Auditoria:**
- Analisa todos os lançamentos e detecta anomalias estatísticas
- Gera relatório de pontos de atenção para o auditor revisar
- Compara DRE mês a mês e explica variações relevantes

### 6.2 OCR Inteligente de Nova Geração
- **Leitura de nota fiscal em papel** (foto com celular) com precisão >98%
- **Leitura de extrato bancário em PDF** — qualquer banco, qualquer formato
- **Leitura de contrato** — extrai partes, objeto, valor, vigência
- **Leitura de CNH e RG** — onboarding de colaboradores
- **Leitura de certidões** — CND, FGTS, trabalhista, estadual, municipal
- **Comparação automática** entre XML da NF e valor do extrato bancário
- **Detecção de fraude** — nota adulterada, XML modificado

### 6.3 Assistente de Reunião com Cliente
- Gravação (com consentimento) e transcrição da reunião com cliente
- Aura extrai: pendências, decisões, próximos passos
- Gera automaticamente a ata da reunião
- Cria tarefas no sistema para cada pendência identificada
- Envia resumo por WhatsApp para o cliente após a reunião

### 6.4 Benchmark Setorial Automático
- Compara indicadores do cliente com empresas do mesmo CNAE e porte
- Identifica se a margem bruta, despesas e tributação estão dentro ou fora do normal
- Gera relatório de benchmark como produto de valor agregado para o cliente
- Dados anonimizados de toda a base de clientes do escritório

### 6.5 Projeção Financeira com IA
- Projeta DRE para os próximos 3/6/12 meses com base no histórico
- Simula cenários: "e se faturamento cair 20%?"
- Alerta sobre risco de insolvência com antecedência
- Projeção de impostos a pagar nos próximos 3 meses
- Fluxo de caixa projetado com alertas de insuficiência

### 6.6 Geração Automática de Relatórios para Clientes
- DRE comentada pela IA (não só números — explica as variações)
- Balanço patrimonial com análise de liquidez, endividamento e rentabilidade
- Relatório de margem por produto/serviço (se cliente tiver dados)
- Resumo executivo de 1 página em PDF elegante, pronto para enviar
- Envio automático até o dia X de cada mês

---

## PARTE 7 — PORTAL DO CLIENTE (PRODUTO DIFERENCIAL MÁXIMO)

### O que é
Um ambiente separado onde **cada empresa cliente do escritório tem acesso exclusivo** ao seu próprio painel. Hoje isso não existe no sistema.

### Funcionalidades do Portal do Cliente
- **Dashboard próprio** — faturamento, impostos pagos, situação fiscal
- **Documentos** — upload de notas, extratos, contracheques
- **Obrigações** — calendário do mês com status (pendente/entregue/vencido)
- **Guias de pagamento** — DAS, DARF, GPS, ISS prontos para baixar
- **Relatórios** — DRE, balanço, fluxo de caixa em PDF elegante
- **Assinatura digital** — aprova documentos diretamente no portal
- **Chat com o contador** — mensagens em contexto (vinculadas à empresa)
- **Aura** — cliente faz perguntas sobre sua própria contabilidade
- **Histórico** — todos os documentos do escritório organizados por mês
- **Notificações** — alertas de vencimentos, pendências, novidades fiscais
- **App mobile** — camera para fotografar notas + acesso ao portal

### Modelo de negócio do portal
- O escritório paga o NEXACONTABIL
- O escritório oferece acesso ao portal como **diferencial competitivo** para seus clientes
- Clientes que têm acesso ao portal têm menor churn (mais fidelizados)

---

## PARTE 8 — SEGURANÇA E COMPLIANCE

### 8.1 Segurança que Falta
- **2FA obrigatório** para operações críticas (transmissão SPED, eSocial)
- **IP whitelist** por empresa
- **Sessão com timeout** configurável
- **Log de acesso completo** com geolocalização
- **Criptografia de dados sensíveis** no banco (CPF, CNPJ, salários)
- **Backup automático** com verificação de integridade
- **Disaster recovery** documentado
- **Pen test** periódico

### 8.2 LGPD Completo
- **DPO** (Data Protection Officer) — contato designado
- **Mapa de dados pessoais** por módulo
- **Consentimento granular** por finalidade
- **Portabilidade de dados** — exportação em formato estruturado
- **Direito ao esquecimento** — anonimização com confirmação
- **RIPD** (Relatório de Impacto à Proteção de Dados)
- **Registro de incidentes** de segurança
- **Notificação à ANPD** em caso de vazamento

### 8.3 Certificações a Buscar
- **ISO 27001** — Segurança da Informação
- **SOC 2 Type II** — para clientes enterprise
- **PCI-DSS** — se processar pagamentos
- **Certificação CFC** — validação do Conselho Federal de Contabilidade

---

## PARTE 9 — ROADMAP DE IMPLEMENTAÇÃO PRIORIZADO

### FASE 1 — CRÍTICO (0 a 3 meses) — O escritório precisa disso agora

| # | Item | Complexidade | Impacto |
|---|---|---|---|
| 1 | NF-e/NFC-e real via NFe.io | Alta | Crítico |
| 2 | NFS-e via NFe.io (+600 municípios) | Alta | Crítico |
| 3 | Manifestação de NF de fornecedor | Média | Alto |
| 4 | Download automático de XMLs via SEFAZ | Média | Alto |
| 5 | Certificado digital A1 (armazenamento + uso) | Alta | Crítico |
| 6 | Consulta CNPJ na Receita (dados automáticos) | Baixa | Alto |
| 7 | Simples Nacional — cálculo do DAS (PGDAS) | Alta | Crítico |
| 8 | Motor tributário básico (CFOP, CST, NCM) | Alta | Crítico |
| 9 | Férias e 13º salário | Média | Alto |
| 10 | Rescisão completa | Alta | Alto |
| 11 | Monitoramento de e-mail para captura de XMLs | Média | Alto |
| 12 | Portal do cliente (MVP básico) | Alta | Diferencial |

### FASE 2 — IMPORTANTE (3 a 6 meses) — Completa a operação

| # | Item |
|---|---|
| 13 | eSocial — eventos de folha (S-1200, S-1299) |
| 14 | eSocial — admissão e demissão (S-2200, S-2299) |
| 15 | EFD-Reinf (R-2010, R-2020, R-4010, R-4020) |
| 16 | DCTFWeb — apuração e transmissão |
| 17 | SPED Fiscal — geração de arquivo |
| 18 | EFD PIS/COFINS — geração de arquivo |
| 19 | FGTS Digital |
| 20 | Conciliação bancária via Open Finance |
| 21 | PIX dinâmico para honorários |
| 22 | DIRF — geração e entrega |
| 23 | GIA estadual (por UF) |
| 24 | Controle de imobilizado e depreciação |

### FASE 3 — DIFERENCIAL (6 a 12 meses) — Torna o sistema único

| # | Item |
|---|---|
| 25 | ECF — IRPJ/CSLL Lucro Real |
| 26 | ECD — Escrituração Contábil Digital |
| 27 | Planejamento tributário comparativo de regimes |
| 28 | Benchmark setorial automático |
| 29 | Assistente de reunião com transcrição |
| 30 | Abertura e baixa de empresas (REDESIM) |
| 31 | Portal do cliente — versão completa |
| 32 | App mobile do portal |
| 33 | Aura proativa com agenda semanal |
| 34 | Geração automática de relatórios mensais |
| 35 | Auditoria fiscal com detecção de anomalias por IA |
| 36 | Certidão Negativa automática (federal, estadual, FGTS, trabalhista) |

---

## PARTE 10 — STACK TÉCNICA RECOMENDADA PARA NOVAS INTEGRAÇÕES

### Integrações Fiscais
```typescript
// Emissão NF-e — NFe.io (recomendado)
POST https://api.nfe.io/v1/companies/{company_id}/productinvoices
Headers: { Authorization: `Bearer ${apiKey}` }

// Alternativa: Focus NFe
POST https://homologacao.focusnfe.com.br/v2/nfe
Headers: { Authorization: `Basic ${base64(token)}` }

// Assinatura com certificado A1
import { Pkcs12 } from '@fidian/pkcs12';
const signed = signXml(xmlContent, pfxBuffer, pfxPassword);
```

### eSocial
```typescript
// Webservice SOAP eSocial
const client = new soap.Client(ESOCIAL_WSDL);
const result = await client.EnviarLoteEventos({
  loteEventos: {
    envioLoteEventos: {
      ideEmpregador: { tpInsc: 1, nrInsc: cnpj },
      ideTransmissor: { tpInsc: 1, nrInsc: cnpjTransmissor },
      eventos: { evento: [{ id, signedXml }] }
    }
  }
});
```

### Open Finance
```typescript
// Padrão Open Finance Brasil (Bacen)
// Fase 2: Dados bancários com consentimento do usuário
GET https://api.banco.com.br/open-banking/accounts/v2/accounts
Headers: { Authorization: `Bearer ${accessToken}` } // OAuth2 com consentimento
```

### Certificado em Nuvem (BirdID)
```typescript
// Autenticação OAuth + assinatura remota
const birdid = new BirdIDClient(clientId, clientSecret);
const token = await birdid.authorize(cpf, otp);
const signature = await birdid.sign(hash, token);
```

---

## RESUMO EXECUTIVO — O QUE FARIA O NEXACONTABIL SER O MELHOR DO MUNDO

1. **Único sistema** com NF-e + NFS-e (600 municípios) + eSocial + SPED + ECF integrados de verdade
2. **Captura zero-touch** de documentos — e-mail, WhatsApp, pasta, câmera, SEFAZ automática
3. **Portal do cliente** onde o cliente acompanha tudo sem ligar para o escritório
4. **Aura proativa** que não espera ser perguntada — avisa, alerta, age
5. **Planejamento tributário** como produto — diferencia o escritório da concorrência
6. **Benchmark setorial** — o cliente sabe se está acima ou abaixo da média
7. **Certificado digital em nuvem** — sem token USB, assina de qualquer lugar
8. **Abertura de empresa** digital — do contrato social à inscrição estadual em 1 sistema
9. **Auditoria por IA** — detecta anomalias que o contador humano não veria
10. **Relatório mensal automático** em PDF elegante, enviado ao cliente sem trabalho manual

> Com todas essas implementações, o NEXACONTABIL / Aura Accounting se tornaria o sistema mais completo e inovador para escritórios de contabilidade no Brasil — superando Domínio (Thomson Reuters), Alterdata, Questor e todos os concorrentes atuais.
