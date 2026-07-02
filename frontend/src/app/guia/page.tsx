'use client';
import { BookOpen, Sun, Headset, FileWarning, CalendarClock, Search, Boxes, Users, Building2, Workflow } from 'lucide-react';

const sec = (icon: any, titulo: string, cor: string, linhas: string[]) => ({ icon, titulo, cor, linhas });

const GESTOR = [
  sec(Sun, 'Meu Dia', '#f59e0b', [
    'Tela inicial: o que precisa de ação hoje (obrigações a vencer, notas com erro).',
    'Use o seletor para ver a fila de qualquer analista ou da carteira toda.',
  ]),
  sec(Building2, 'Visão Geral / Torre de Controle', '#6366f1', [
    'Panorama de todos os clientes: produção, pendências, entregas.',
    'Clique num cliente para abrir o Painel do Cliente detalhado.',
  ]),
  sec(Users, 'Produtividade & Atribuir Responsáveis', '#10b981', [
    'Produtividade: docs e taxa de erro por analista + insights de carga.',
    'Atribuir Responsáveis: distribua os clientes entre a equipe (automático ou manual).',
  ]),
  sec(FileWarning, 'Central de Inconsistências', '#ef4444', [
    'Malha fina: os erros fiscais reais, priorizados por valor.',
    'Clique num cliente para ver cada erro e o passo a passo de correção.',
  ]),
  sec(CalendarClock, 'Mapa de Prazos & SLA', '#3b82f6', [
    'Todas as obrigações da carteira na linha do tempo, com alerta de atraso.',
  ]),
  sec(Headset, 'Central de Atendimento', '#a855f7', [
    'Inbox único: WhatsApp, e-mail e manual. Substitui o atendimento no MEGA.',
    'Cada conversa vira ticket — atribua, responda e resolva no painel.',
  ]),
];

const ANALISTA = [
  sec(Sun, 'Meu Dia', '#f59e0b', [
    'Sua fila do dia: clientes seus com pendências, priorizado.',
    'Clique num item de erro para ver como corrigir.',
  ]),
  sec(Headset, 'Atendimentos (WhatsApp)', '#a855f7', [
    'Os clientes que você atende. Abra a conversa e responda pelo painel.',
    'A IA já responde dúvidas simples (DAS, certidões, notas) sozinha.',
  ]),
  sec(Search, 'Buscar Documentos', '#6366f1', [
    'Peça em linguagem natural: "NF da Padaria de maio acima de 1000".',
    'Traz a nota + análise fiscal + botão para baixar o XML.',
  ]),
  sec(Workflow, 'Operação Fiscal', '#10b981', [
    'Captura de XMLs → Esteira → Exportar p/ Domínio: o fluxo do lançamento.',
    'Banco de NCM: consulta a tributação correta (substitui o E-Conet).',
  ]),
  sec(FileWarning, 'Inconsistências', '#ef4444', [
    'Os erros das suas notas, com causa e correção. Trabalhe a fila por valor.',
  ]),
];

export default function GuiaPage() {
  return (
    <div style={{ maxWidth: 920, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10 }}>
        <BookOpen size={24} color="#6366f1" /> Guia de Uso
      </h1>
      <p style={{ color: '#94a3b8', marginTop: 4 }}>Como operar o sistema no dia a dia.</p>

      <Bloco titulo="Fluxo recomendado do dia" cor="#6366f1">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: '#cbd5e1', fontSize: 14 }}>
          <li><strong>Meu Dia</strong> — abra e veja suas pendências priorizadas.</li>
          <li><strong>Atendimentos</strong> — responda os clientes no WhatsApp.</li>
          <li><strong>Captura → Esteira → Exportar</strong> — processe os XMLs e lance no Domínio.</li>
          <li><strong>Inconsistências</strong> — corrija os erros fiscais (cada um tem o passo a passo).</li>
          <li><strong>Prazos</strong> — confira o que vence e entregue.</li>
        </ol>
      </Bloco>

      <Grupo titulo="👤 Para o Analista" itens={ANALISTA} />
      <Grupo titulo="📊 Para o Gestor" itens={GESTOR} />

      <Bloco titulo="A ideia de ouro — Banco de NCM" cor="#10b981">
        <p style={{ color: '#cbd5e1', fontSize: 14, margin: 0, lineHeight: 1.7 }}>
          Base única de NCM + tributação por segmento, construída com os dados reais de todos os clientes.
          Consulte e exporte para parametrizar os sistemas — o XML já chega correto, menos retrabalho e menos erro.
        </p>
      </Bloco>
    </div>
  );
}

function Grupo({ titulo, itens }: { titulo: string; itens: any[] }) {
  return (
    <div style={{ marginTop: 28 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, marginBottom: 12 }}>{titulo}</h2>
      {itens.map((s, i) => {
        const Icon = s.icon;
        return (
          <div key={i} style={{ background: '#161b27', border: '1px solid #2a3142', borderLeft: `3px solid ${s.cor}`, borderRadius: 10, padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: s.cor }}>
              <Icon size={16} /> {s.titulo}
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.7 }}>
              {s.linhas.map((l: string, j: number) => <li key={j}>{l}</li>)}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Bloco({ titulo, cor, children }: any) {
  return (
    <div style={{ marginTop: 22, background: '#0f1722', border: `1px solid ${cor}40`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 700, color: cor, marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  );
}
