'use client';
import { useState, FormEvent } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCompany } from '@/contexts/CompanyContext';
import {
  User, Key, Bell, Brain, Shield, Loader2,
  CheckCircle2, Eye, EyeOff, Save, LogOut
} from 'lucide-react';
import { useRouter } from 'next/navigation';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

type Tab = 'perfil' | 'seguranca' | 'ia' | 'notificacoes';

function TabBtn({ id, label, icon: Icon, active, onClick }: any) {
  return (
    <button
      onClick={() => onClick(id)}
      className={`flex items-center gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${
        active
          ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
          : 'text-gray-400 hover:text-white hover:bg-white/5'
      }`}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card-aura space-y-5">
      <h3 className="font-semibold text-white text-base">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        <p className="text-sm text-white">{label}</p>
        {desc && <p className="text-xs text-gray-500 mt-0.5">{desc}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        value ? 'bg-indigo-600' : 'bg-[#1e2740]'
      }`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
        value ? 'translate-x-6' : 'translate-x-1'
      }`} />
    </button>
  );
}

export default function SettingsPage() {
  const { user, token, logout } = useAuth();
  const { selectedCompany } = useCompany();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('perfil');

  // Perfil
  const [name, setName] = useState(user?.name ?? '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState('');

  // Segurança
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [showPass, setShowPass] = useState(false);
  const [passSaving, setPassSaving] = useState(false);
  const [passMsg, setPassMsg] = useState('');
  const [passError, setPassError] = useState('');

  // IA
  const [iaSettings, setIaSettings] = useState({
    model: 'gpt-4o',
    temperature: '0.2',
    maxTokens: '2048',
    useRag: true,
    autoApprove: false,
  });

  // Notificações
  const [notifSettings, setNotifSettings] = useState({
    emailDocProcessed: true,
    emailHighRisk: true,
    emailWeeklyReport: false,
    pushHighRisk: true,
  });

  const handleSaveProfile = async (e: FormEvent) => {
    e.preventDefault();
    setProfileMsg('');
    setProfileSaving(true);
    try {
      const r = await fetch(`${API}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error('Erro ao salvar');
      setProfileMsg('Perfil atualizado com sucesso!');
      setTimeout(() => setProfileMsg(''), 3000);
    } catch {
      setProfileMsg('Erro ao atualizar perfil');
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSavePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPassError('');
    setPassMsg('');
    if (passwords.newPass !== passwords.confirm) {
      setPassError('As senhas não coincidem');
      return;
    }
    if (passwords.newPass.length < 6) {
      setPassError('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    setPassSaving(true);
    try {
      const r = await fetch(`${API}/api/v1/auth/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ password: passwords.newPass }),
      });
      if (!r.ok) throw new Error('Erro ao salvar');
      setPassMsg('Senha alterada com sucesso!');
      setPasswords({ current: '', newPass: '', confirm: '' });
      setTimeout(() => setPassMsg(''), 3000);
    } catch {
      setPassError('Erro ao alterar senha');
    } finally {
      setPassSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  const TABS: { id: Tab; label: string; icon: any }[] = [
    { id: 'perfil',        label: 'Perfil',          icon: User },
    { id: 'seguranca',     label: 'Segurança',        icon: Shield },
    { id: 'ia',            label: 'Configurações IA', icon: Brain },
    { id: 'notificacoes',  label: 'Notificações',     icon: Bell },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-gray-400 text-sm mt-1">
          {user?.name} · {user?.email} · {user?.role}
        </p>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <div className="w-48 flex-shrink-0 space-y-1">
          {TABS.map(t => (
            <TabBtn key={t.id} id={t.id} label={t.label} icon={t.icon}
              active={tab === t.id} onClick={setTab} />
          ))}
          <div className="pt-4 border-t border-[#1e2740] mt-4">
            <button
              onClick={handleLogout}
              className="flex items-center gap-2.5 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:text-red-300 hover:bg-red-400/5 transition-all"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-6">
          {/* ── Perfil ── */}
          {tab === 'perfil' && (
            <>
              <Section title="Informações do Perfil">
                <form onSubmit={handleSaveProfile} className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Nome</label>
                    <input
                      value={name}
                      onChange={e => setName(e.target.value)}
                      className="w-full bg-[#0f1117] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">E-mail</label>
                    <input
                      value={user?.email ?? ''}
                      disabled
                      className="w-full bg-[#0a0d14] border border-[#1e2740] rounded-xl px-4 py-2.5 text-gray-500 text-sm cursor-not-allowed"
                    />
                    <p className="text-xs text-gray-600 mt-1">E-mail não pode ser alterado</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Função</label>
                    <input
                      value={user?.role ?? ''}
                      disabled
                      className="w-full bg-[#0a0d14] border border-[#1e2740] rounded-xl px-4 py-2.5 text-gray-500 text-sm cursor-not-allowed capitalize"
                    />
                  </div>
                  {profileMsg && (
                    <div className="flex items-center gap-2 text-green-400 text-sm">
                      <CheckCircle2 className="h-4 w-4" />
                      {profileMsg}
                    </div>
                  )}
                  <button type="submit" disabled={profileSaving}
                    className="btn-primary flex items-center gap-2">
                    {profileSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar
                  </button>
                </form>
              </Section>

              {selectedCompany && (
                <Section title="Empresa Selecionada">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Nome</span>
                      <span className="text-white">{selectedCompany.name}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">CNPJ</span>
                      <span className="text-white font-mono">
                        {selectedCompany.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-400">Regime</span>
                      <span className="text-white">{selectedCompany.taxRegime?.replace('_', ' ')}</span>
                    </div>
                  </div>
                </Section>
              )}
            </>
          )}

          {/* ── Segurança ── */}
          {tab === 'seguranca' && (
            <Section title="Alterar Senha">
              <form onSubmit={handleSavePassword} className="space-y-4">
                <div className="relative">
                  <label className="block text-xs text-gray-400 mb-1.5">Nova senha</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={passwords.newPass}
                      onChange={e => setPasswords(p => ({ ...p, newPass: e.target.value }))}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full bg-[#0f1117] border border-[#1e2740] rounded-xl px-4 py-2.5 pr-11 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
                    />
                    <button type="button" onClick={() => setShowPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-400 mb-1.5">Confirmar nova senha</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={passwords.confirm}
                    onChange={e => setPasswords(p => ({ ...p, confirm: e.target.value }))}
                    placeholder="Repita a senha"
                    className="w-full bg-[#0f1117] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
                  />
                </div>
                {passError && <p className="text-red-400 text-sm">{passError}</p>}
                {passMsg && (
                  <div className="flex items-center gap-2 text-green-400 text-sm">
                    <CheckCircle2 className="h-4 w-4" />
                    {passMsg}
                  </div>
                )}
                <button type="submit" disabled={passSaving}
                  className="btn-primary flex items-center gap-2">
                  {passSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Key className="h-4 w-4" />}
                  Alterar Senha
                </button>
              </form>
            </Section>
          )}

          {/* ── IA ── */}
          {tab === 'ia' && (
            <>
              <Section title="Modelo e Parâmetros">
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1.5">Modelo padrão</label>
                    <select value={iaSettings.model}
                      onChange={e => setIaSettings(s => ({ ...s, model: e.target.value }))}
                      className="w-full bg-[#0f1117] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500">
                      <option value="gpt-4o">GPT-4o (OpenAI)</option>
                      <option value="gpt-4o-mini">GPT-4o Mini (mais rápido)</option>
                      <option value="claude-sonnet-4-6">Claude Sonnet 4.6 (Anthropic)</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Temperature ({iaSettings.temperature})</label>
                      <input type="range" min="0" max="1" step="0.1"
                        value={iaSettings.temperature}
                        onChange={e => setIaSettings(s => ({ ...s, temperature: e.target.value }))}
                        className="w-full accent-indigo-500" />
                      <div className="flex justify-between text-xs text-gray-600 mt-1">
                        <span>Preciso</span><span>Criativo</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-400 mb-1.5">Max Tokens</label>
                      <input type="number" value={iaSettings.maxTokens}
                        onChange={e => setIaSettings(s => ({ ...s, maxTokens: e.target.value }))}
                        className="w-full bg-[#0f1117] border border-[#1e2740] rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-indigo-500" />
                    </div>
                  </div>
                </div>
              </Section>

              <Section title="Comportamento dos Agentes">
                <div className="space-y-5">
                  <Field label="Usar RAG (contexto histórico)"
                    desc="Consulta documentos anteriores para classificação contábil mais precisa">
                    <Toggle value={iaSettings.useRag}
                      onChange={v => setIaSettings(s => ({ ...s, useRag: v }))} />
                  </Field>
                  <Field label="Aprovação automática"
                    desc="Aprova lançamentos com confiança > 95% automaticamente (use com cautela)">
                    <Toggle value={iaSettings.autoApprove}
                      onChange={v => setIaSettings(s => ({ ...s, autoApprove: v }))} />
                  </Field>
                </div>
              </Section>

              <div className="flex justify-end">
                <button className="btn-primary flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Salvar configurações
                </button>
              </div>
            </>
          )}

          {/* ── Notificações ── */}
          {tab === 'notificacoes' && (
            <Section title="Preferências de Notificação">
              <div className="space-y-5">
                <Field label="E-mail: documento processado"
                  desc="Receba e-mail quando um documento for processado pelos agentes">
                  <Toggle value={notifSettings.emailDocProcessed}
                    onChange={v => setNotifSettings(s => ({ ...s, emailDocProcessed: v }))} />
                </Field>
                <Field label="E-mail: risco alto detectado"
                  desc="Alertas imediatos para documentos com risco de fraude ou irregularidade">
                  <Toggle value={notifSettings.emailHighRisk}
                    onChange={v => setNotifSettings(s => ({ ...s, emailHighRisk: v }))} />
                </Field>
                <Field label="E-mail: relatório semanal"
                  desc="Resumo semanal de documentos, lançamentos e indicadores fiscais">
                  <Toggle value={notifSettings.emailWeeklyReport}
                    onChange={v => setNotifSettings(s => ({ ...s, emailWeeklyReport: v }))} />
                </Field>
                <Field label="Push: risco alto (WhatsApp/Browser)"
                  desc="Notificação push imediata para situações críticas">
                  <Toggle value={notifSettings.pushHighRisk}
                    onChange={v => setNotifSettings(s => ({ ...s, pushHighRisk: v }))} />
                </Field>
              </div>
              <div className="pt-4 border-t border-[#1e2740] flex justify-end">
                <button className="btn-primary flex items-center gap-2">
                  <Save className="h-4 w-4" />
                  Salvar preferências
                </button>
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  );
}
