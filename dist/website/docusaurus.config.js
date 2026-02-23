"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prism_react_renderer_1 = require("prism-react-renderer");
const config = {
    title: 'PumpFun Trading Bot',
    tagline: 'Automated Solana memecoin trading with multi-protocol support',
    favicon: 'img/favicon.ico',
    future: {
        v4: true,
    },
    url: 'https://your-domain.com',
    baseUrl: '/',
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
            },
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
            theme: prism_react_renderer_1.themes.github,
            darkTheme: prism_react_renderer_1.themes.dracula,
            additionalLanguages: ['typescript', 'bash', 'json', 'solidity'],
        },
    },
};
exports.default = config;
//# sourceMappingURL=docusaurus.config.js.map