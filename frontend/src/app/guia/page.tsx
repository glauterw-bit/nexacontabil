'use client';
import { BookOpen, Sun, Headset, FileWarning, CalendarClock, Search, Boxes, Users, Building2, Workflow } from 'lucide-react';
import { tint, PageHeader, SectionTitle, Card, COLORS } from '@/components/ui/kit';

const sec = (icon: any, titulo: string, cor: string, linhas: string[]) => ({ icon, titulo, cor, linhas });

const GESTOR = [
  sec(Sun, 'Meu Dia', 'var(--atencao)', [
    'Tela inicial: o que precisa de ação hoje (obrigações a vencer, notas com erro).',
    'Use o seletor para ver a fila de qualquer analista ou da carteira toda.',
  ]),
  sec(Building2, 'Visão Geral / Torre de Controle', 'var(--acao)', [
    'Panorama de todos os clientes: produção, pendências, entregas.',
    'Clique num cliente para abrir o Painel do Cliente detalhado.',
  ]),
  sec(Users, 'Produtividade & Atribuir Responsáveis', 'var(--ok)', [
    'Produtividade: docs e taxa de erro por analista + insights de carga.',
    'Atribuir Responsáveis: distribua os clientes entre a equipe (automático ou manual).',
  ]),
  sec(FileWarning, 'Central de Inconsistências', 'var(--erro)', [
    'Malha fina: os erros fiscais reais, priorizados por valor.',
    'Clique num cliente para ver cada erro e o passo a passo de correção.',
  ]),
  sec(CalendarClock, 'Mapa de Prazos & SLA', 'var(--info)', [
    'Todas as obrigações da carteira na linha do tempo, com alerta de atraso.',
  ]),
  sec(Headset, 'Central de Atendimento', 'var(--info)', [
    'Inbox único: WhatsApp, e-mail e manual. Substitui o atendimento no MEGA.',
    'Cada conversa vira ticket — atribua, responda e resolva no painel.',
  ]),
];

const ANALISTA = [
  sec(Sun, 'Meu Dia', 'var(--atencao)', [
    'Sua fila do dia: clientes seus com pendências, priorizado.',
    'Clique num item de erro para ver como corrigir.',
  ]),
  sec(Headset, 'Atendimentos (WhatsApp)', 'var(--info)', [
    'Os clientes que você atende. Abra a conversa e responda pelo painel.',
    'A IA já responde dúvidas simples (DAS, certidões, notas) sozinha.',
  ]),
  sec(Search, 'Buscar Documentos', 'var(--acao)', [
    'Peça em linguagem natural: "NF da Padaria de maio acima de 1000".',
    'Traz a nota + análise fiscal + botão para baixar o XML.',
  ]),
  sec(Workflow, 'Operação Fiscal', 'var(--ok)', [
    'Captura de XMLs → Esteira → Exportar p/ Domínio: o fluxo do lançamento.',
    'Banco de NCM: consulta a tributação correta (substitui o E-Conet).',
  ]),
  sec(FileWarning, 'Inconsistências', 'var(--erro)', [
    'Os erros das suas notas, com causa e correção. Trabalhe a fila por valor.',
  ]),
];

export default function GuiaPage() {
  return (
    <div className="page-narrow">
      <PageHeader
        icon={<BookOpen size={22} color={COLORS.acao} />}
        title="Guia de Uso"
        subtitle="Como operar o sistema no dia a dia."
      />

      <Bloco titulo="Fluxo recomendado do dia" cor="var(--acao)">
        <ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9, color: 'var(--tx)', fontSize: 13.5 }}>
          <li><strong>Meu Dia</strong> — abra e veja suas pendências priorizadas.</li>
          <li><strong>Atendimentos</strong> — responda os clientes no WhatsApp.</li>
          <li><strong>Captura → Esteira → Exportar</strong> — processe os XMLs e lance no Domínio.</li>
          <li><strong>Inconsistências</strong> — corrija os erros fiscais (cada um tem o passo a passo).</li>
          <li><strong>Prazos</strong> — confira o que vence e entregue.</li>
        </ol>
      </Bloco>

      <Grupo titulo="👤 Para o Analista" itens={ANALISTA} />
      <Grupo titulo="📊 Para o Gestor" itens={GESTOR} />

      <Bloco titulo="A ideia de ouro — Banco de NCM" cor="var(--ok)">
        <p style={{ color: 'var(--tx)', fontSize: 13.5, margin: 0, lineHeight: 1.7 }}>
          Base única de NCM + tributação por segmento, construída com os dados reais de todos os clientes.
          Consulte e exporte para parametrizar os sistemas — o XML já chega correto, menos retrabalho e menos erro.
        </p>
      </Bloco>
    </div>
  );
}

function Grupo({ titulo, itens }: { titulo: string; itens: any[] }) {
  return (
    <div>
      <SectionTitle>{titulo}</SectionTitle>
      {itens.map((s, i) => {
        const Icon = s.icon;
        return (
          <Card key={i} accent={s.cor} style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13.5, color: COLORS.strong }}>
              <Icon size={16} color={COLORS.muted} /> {s.titulo}
            </div>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20, color: 'var(--tx)', fontSize: 13, lineHeight: 1.7 }}>
              {s.linhas.map((l: string, j: number) => <li key={j}>{l}</li>)}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function Bloco({ titulo, cor, children }: any) {
  return (
    <div style={{ marginTop: 22, background: 'var(--surface2)', border: `1px solid ${tint(cor, 25)}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontWeight: 600, fontSize: 15, color: cor, marginBottom: 10 }}>{titulo}</div>
      {children}
    </div>
  );
}
