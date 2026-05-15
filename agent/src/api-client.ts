import * as fs from 'fs/promises';

export class ApiClient {
  constructor(private apiUrl: string, private jwt?: string) {}

  setJwt(jwt: string | undefined) { this.jwt = jwt; }

  private headers(extra?: Record<string, string>) {
    return {
      'Content-Type': 'application/json',
      ...(this.jwt ? { Authorization: `Bearer ${this.jwt}` } : {}),
      ...extra,
    };
  }

  async login(email: string, password: string) {
    const res = await fetch(`${this.apiUrl}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login falhou: HTTP ${res.status}`);
    return res.json() as Promise<{
      access_token: string;
      user: { id: string; email: string; name: string; role: string; companyId?: string };
    }>;
  }

  async listCompanies() {
    const res = await fetch(`${this.apiUrl}/graphql`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ query: '{ companies { id name cnpj taxRegime } }' }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.data?.companies ?? []) as Array<{
      id: string; name: string; cnpj: string; taxRegime: string;
    }>;
  }

  async analyzeFile(companyId: string, absPath: string, filename: string) {
    const buf = await fs.readFile(absPath);
    const base64 = buf.toString('base64');
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    let mediaType: string;
    if (ext === 'pdf') mediaType = 'application/pdf';
    else if (ext === 'xml') mediaType = 'application/xml';
    else if (ext === 'png') mediaType = 'image/png';
    else if (ext === 'webp') mediaType = 'image/webp';
    else mediaType = 'image/jpeg';

    const res = await fetch(`${this.apiUrl}/api/v1/documents/analyze`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ companyId, filename, base64, mediaType }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Analyze HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('Resposta nao-JSON do servidor');
    }
  }

  async searchNatural(companyId: string, query: string) {
    const res = await fetch(`${this.apiUrl}/api/v1/documents/search-natural`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ companyId, query, limit: 50 }),
    });
    if (!res.ok) throw new Error(`Search HTTP ${res.status}`);
    return res.json();
  }
}
