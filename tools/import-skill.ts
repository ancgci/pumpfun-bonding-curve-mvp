#!/usr/bin/env node

/**
 * SKILL IMPORT CLI
 *
 * Import skills from GitHub repos or list installed skills.
 *
 * Usage:
 *   npx ts-node tools/import-skill.ts --list                          # List installed skills
 *   npx ts-node tools/import-skill.ts --url <github-raw-url>          # Import from raw URL
 *   npx ts-node tools/import-skill.ts --repo user/repo --file path.md # Import from GitHub repo
 *   npx ts-node tools/import-skill.ts --delete SkillName              # Delete a skill
 */

import * as fs from "fs";
import * as path from "path";
import axios from "axios";

const SKILLS_DIR = path.join(__dirname, "../.agents/skills");

// ── Helpers ──────────────────────────────────────────────────────────

function ensureSkillsDir(): void {
    if (!fs.existsSync(SKILLS_DIR)) {
        fs.mkdirSync(SKILLS_DIR, { recursive: true });
    }
}

function parseFrontmatter(raw: string): Record<string, any> {
    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---/;
    const match = raw.match(fmRegex);
    if (!match) return {};

    const meta: Record<string, any> = {};
    for (const line of match[1].split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;
        const key = trimmed.slice(0, colonIdx).trim();
        let value: any = trimmed.slice(colonIdx + 1).trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        meta[key] = value;
    }
    return meta;
}

// ── Commands ─────────────────────────────────────────────────────────

function listSkills(): void {
    ensureSkillsDir();
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md"));

    if (files.length === 0) {
        console.log("📭 No skills installed.");
        console.log(`   Directory: ${SKILLS_DIR}`);
        return;
    }

    console.log(`\n🎯 Installed Skills (${files.length}):\n`);
    console.log(`  ${"NAME".padEnd(22)}${"VERSION".padEnd(12)}${"AUTHOR".padEnd(12)}DESCRIPTION`);
    console.log("  " + "-".repeat(70));

    for (const file of files) {
        const raw = fs.readFileSync(path.join(SKILLS_DIR, file), "utf-8");
        const meta = parseFrontmatter(raw);
        const name = (meta.name || file.replace(".md", "")).padEnd(22);
        const version = `v${meta.version || "?"}`.padEnd(12);
        const author = (meta.author || "unknown").padEnd(12);
        const desc = meta.description || "(no description)";
        console.log(`  ${name}${version}${author}${desc}`);
    }

    console.log(`\n  Directory: ${SKILLS_DIR}\n`);
}

async function importFromUrl(url: string): Promise<void> {
    ensureSkillsDir();

    console.log(`⬇️  Downloading skill from: ${url}`);

    try {
        const resp = await axios.get(url, { timeout: 15000 });
        const content = resp.data;

        if (typeof content !== "string") {
            console.error("❌ URL did not return text content.");
            process.exit(1);
        }

        // Validate frontmatter
        const meta = parseFrontmatter(content);
        if (!meta.name) {
            console.error("❌ Skill file missing 'name' in frontmatter.");
            console.error("   Expected format:\n   ---\n   name: MySkill\n   description: ...\n   ---");
            process.exit(1);
        }

        const filename = `${meta.name}.md`;
        const destPath = path.join(SKILLS_DIR, filename);

        if (fs.existsSync(destPath)) {
            console.log(`⚠️  Skill '${meta.name}' already exists. Overwriting...`);
        }

        fs.writeFileSync(destPath, content, "utf-8");
        console.log(`✅ Skill '${meta.name}' imported successfully!`);
        console.log(`   File: ${destPath}`);
        console.log(`   Version: ${meta.version || "?"}`);
        console.log(`   Description: ${meta.description || "(none)"}`);
    } catch (err: any) {
        console.error(`❌ Failed to download: ${err.message}`);
        process.exit(1);
    }
}

async function importFromRepo(repo: string, filePath: string): Promise<void> {
    // Convert GitHub repo + file path to raw URL
    // Format: user/repo -> https://raw.githubusercontent.com/user/repo/main/filepath
    const branches = ["main", "master"];

    for (const branch of branches) {
        const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${filePath}`;
        try {
            await importFromUrl(rawUrl);
            return;
        } catch {
            // Try next branch
        }
    }

    console.error(`❌ Could not find file '${filePath}' in repo '${repo}' (tried main and master branches).`);
    process.exit(1);
}

function deleteSkill(name: string): void {
    ensureSkillsDir();
    const filePath = path.join(SKILLS_DIR, `${name}.md`);

    if (!fs.existsSync(filePath)) {
        console.error(`❌ Skill '${name}' not found at: ${filePath}`);
        process.exit(1);
    }

    fs.unlinkSync(filePath);
    console.log(`🗑️  Skill '${name}' deleted.`);
}

// ── CLI Argument Parser ──────────────────────────────────────────────

function main(): void {
    const args = process.argv.slice(2);

    if (args.length === 0 || args.includes("--help") || args.includes("-h")) {
        console.log(`
🎯 Skill Import CLI

Usage:
  npx ts-node tools/import-skill.ts --list
  npx ts-node tools/import-skill.ts --url <raw-url-to-skill.md>
  npx ts-node tools/import-skill.ts --repo <user/repo> --file <path/to/skill.md>
  npx ts-node tools/import-skill.ts --delete <SkillName>

Examples:
  # List all installed skills
  npx ts-node tools/import-skill.ts --list

  # Import from a direct URL
  npx ts-node tools/import-skill.ts --url https://raw.githubusercontent.com/user/repo/main/skills/Sniper.md

  # Import from a GitHub repo
  npx ts-node tools/import-skill.ts --repo solana-labs/trading-skills --file skills/DexAnalyzer.md

  # Delete a skill
  npx ts-node tools/import-skill.ts --delete MyOldSkill
`);
        return;
    }

    if (args.includes("--list")) {
        listSkills();
        return;
    }

    if (args.includes("--delete")) {
        const idx = args.indexOf("--delete");
        const name = args[idx + 1];
        if (!name) {
            console.error("❌ --delete requires a skill name.");
            process.exit(1);
        }
        deleteSkill(name);
        return;
    }

    if (args.includes("--url")) {
        const idx = args.indexOf("--url");
        const url = args[idx + 1];
        if (!url) {
            console.error("❌ --url requires a URL argument.");
            process.exit(1);
        }
        importFromUrl(url).catch(err => {
            console.error(err.message);
            process.exit(1);
        });
        return;
    }

    if (args.includes("--repo")) {
        const repoIdx = args.indexOf("--repo");
        const fileIdx = args.indexOf("--file");
        const repo = args[repoIdx + 1];
        const file = fileIdx >= 0 ? args[fileIdx + 1] : undefined;

        if (!repo || !file) {
            console.error("❌ --repo requires both --repo <user/repo> and --file <path/to/skill.md>.");
            process.exit(1);
        }

        importFromRepo(repo, file).catch(err => {
            console.error(err.message);
            process.exit(1);
        });
        return;
    }

    console.error("❌ Unknown arguments. Use --help for usage.");
    process.exit(1);
}

main();
