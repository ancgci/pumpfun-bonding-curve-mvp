import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

const config: Config = {
  title: 'PumpFun Trading Bot',
  tagline: 'Automated Solana memecoin trading with multi-protocol support',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://your-domain.com',
  baseUrl: '/',

  // Customize for your GitHub repo
  organizationName: 'your-github-username',
  projectName: 'pumpfun-bonding-curve-Test',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Remove edit URL or customize to your repo
          // editUrl: 'https://github.com/your-username/your-repo/tree/main/website/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themeConfig: {
    image: 'img/docusaurus-social-card.jpg',
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: false,
    },
    navbar: {
      title: 'Trading Bot',
      logo: {
        alt: 'Trading Bot Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'docs',
          position: 'left',
          label: 'Documentation',
        },
        { to: '/blog', label: 'Changelog', position: 'left' },
        {
          href: 'https://github.com/ancgci/pumpfun-bonding-curve-Test',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Docs',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/README',
            },
            {
              label: 'Configuration',
              to: '/docs/CONFIGURATION',
            },
            {
              label: 'Architecture',
              to: '/docs/ARCHITECTURE',
            },
          ],
        },
        {
          title: 'Features',
          items: [
            {
              label: 'Dashboard',
              to: '/docs/DASHBOARD',
            },
            {
              label: 'Backtest System',
              to: '/docs/BACKTEST',
            },
            {
              label: 'API Reference',
              to: '/docs/API',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Changelog',
              to: '/blog',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/your-username/pumpfun-bonding-curve-Test',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} PumpFun Trading Bot. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['typescript', 'bash', 'json', 'solidity'],
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
