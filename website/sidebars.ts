import type { SidebarsConfig } from '@docusaurus/plugin-content-docs';

const sidebars: SidebarsConfig = {
  docs: [ // Using 'docs' as the sidebar ID as expected by docusaurus.config.ts
    {
      type: 'doc',
      id: 'README',
      label: '🏠 Home',
    },
    {
      type: 'category',
      label: '🚀 Getting Started',
      items: [
        'USAGE',
        'CONFIGURATION',
        'GUIDE',
      ],
    },
    {
      type: 'category',
      label: '✨ Features',
      items: [
        'DASHBOARD',
        'BACKTEST',
        'ARCHITECTURE',
      ],
    },
    {
      type: 'category',
      label: '📚 Advanced',
      items: [
        'API',
        'IMPLEMENTACAO_HIBRIDA',
        'CONFIGURACAO_STOP_LOSS',
      ],
    },
    {
      type: 'category',
      label: '📋 Planning & Analysis',
      collapsed: true,
      items: [
        'PLANO_DE_ACAO',
        'ANALISE_E_MELHORIAS',
        'PENDING_IMPLEMENTATIONS',
      ],
    },
  ],
};

export default sidebars;
