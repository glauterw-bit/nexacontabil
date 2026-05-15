import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/public.decorator';

const GITHUB_OWNER = 'glauterw-bit';
const GITHUB_REPO = 'nexacontabil';

interface ReleaseInfo {
  version: string;
  publishedAt: string;
  windows?: { downloadUrl: string; size: number };
  mac?: { downloadUrl: string; size: number };
  linux?: { downloadUrl: string; size: number };
  installInstructions: {
    windows: string[];
    mac: string[];
  };
}

@Controller('desktop-agent')
export class DesktopAgentController {
  /**
   * Retorna metadata do último release do agente desktop.
   * Consulta GitHub API publica (sem token — limite ~60 req/h por IP).
   */
  @Public()
  @Get('release')
  async getLatestRelease(): Promise<ReleaseInfo | { error: string }> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases`,
        { headers: { Accept: 'application/vnd.github.v3+json' } },
      );
      if (!res.ok) {
        return this.fallback('Nenhum release disponivel ainda. Build em https://github.com/glauterw-bit/nexacontabil/actions/workflows/build-agent.yml');
      }
      const all = (await res.json()) as Array<any>;
      // aceita tag 'agent-v*' OU 'v*' (electron-builder usa version do package.json)
      const release = all.find(
        (r) => !r.draft && (
          (r.tag_name ?? '').startsWith('agent-v') ||
          ((r.tag_name ?? '').startsWith('v') && (r.assets ?? []).some((a: any) => /\.(exe|dmg|AppImage)$/i.test(a.name ?? '')))
        ),
      );
      if (!release) {
        return this.fallback('Nenhum release publicado do agent. Rode o workflow Build Desktop Agent.');
      }

      const info: ReleaseInfo = {
        version: (release.tag_name ?? '').replace(/^(agent-)?v/, ''),
        publishedAt: release.published_at,
        installInstructions: this.installInstructions(),
      };

      for (const asset of release.assets ?? []) {
        const name = (asset.name ?? '').toLowerCase();
        if (name.endsWith('.exe') && name.includes('setup')) {
          info.windows = { downloadUrl: asset.browser_download_url, size: asset.size };
        } else if (name.endsWith('.dmg')) {
          info.mac = { downloadUrl: asset.browser_download_url, size: asset.size };
        } else if (name.endsWith('.appimage')) {
          info.linux = { downloadUrl: asset.browser_download_url, size: asset.size };
        }
      }

      return info;
    } catch (err: any) {
      return this.fallback(`Erro ao consultar releases: ${err?.message ?? 'desconhecido'}`);
    }
  }

  private fallback(reason: string): ReleaseInfo {
    return {
      version: 'unreleased',
      publishedAt: new Date().toISOString(),
      installInstructions: this.installInstructions(),
      // sem URL — front mostra mensagem
      ...({} as any),
    };
  }

  private installInstructions() {
    return {
      windows: [
        'Baixe o instalador clicando no botao acima.',
        'Se o Windows alertar "SmartScreen", clique em "Mais informacoes" e depois "Executar mesmo assim".',
        'Siga o instalador (Avancar > Avancar > Instalar).',
        'O agente aparece como icone na bandeja do sistema (canto inferior direito, perto do relogio).',
        'Clique com botao direito no icone e selecione "Configuracoes" para fazer login e adicionar pastas para monitorar.',
      ],
      mac: [
        'Baixe o .dmg clicando no botao acima.',
        'Abra o arquivo e arraste para Applications.',
        'Na primeira execucao, va em Configuracoes > Seguranca > Permitir mesmo assim (apenas uma vez).',
        'O icone aparece na barra de menu superior.',
      ],
    };
  }
}
