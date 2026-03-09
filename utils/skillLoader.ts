import * as fs from "fs";
import * as path from "path";
import logger from "./logger";

/**
 * SKILL LOADER
 *
 * Discovers, parses, and caches skill files from .agents/skills/
 * Each skill is a Markdown file with YAML frontmatter containing:
 *   - name, description, version, tags, author, priority
 *   - Body: detailed instructions for the LLM agent
 *
 * Features:
 *   - Auto-discovery on init
 *   - Hot-reload (re-scan without restart)
 *   - Just-in-time content loading (only reads full body when needed)
 */

const SKILLS_DIR = path.join(process.cwd(), ".agents/skills/custom");

// ── Types ────────────────────────────────────────────────────────────

export interface SkillMeta {
    name: string;
    description: string;
    version: string;
    tags: string[];
    author: string;
    priority: number;
    filePath: string;
}

export interface SkillFull extends SkillMeta {
    content: string; // body after frontmatter
}

// ── Frontmatter parser (zero-dep) ────────────────────────────────────

function parseFrontmatter(raw: string): { meta: Record<string, any>; body: string } {
    const fmRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
    const match = raw.match(fmRegex);
    if (!match) {
        return { meta: {}, body: raw };
    }

    const yamlBlock = match[1];
    const body = match[2];

    // Minimal YAML parser for flat key-value + arrays + multi-line lists
    const meta: Record<string, any> = {};
    let currentKey: string | null = null;

    for (const line of yamlBlock.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        // Handle multi-line list items: "- value"
        if (trimmed.startsWith("-") && currentKey) {
            const val = trimmed.slice(1).trim().replace(/^["']|["']$/g, "");
            if (!Array.isArray(meta[currentKey])) {
                meta[currentKey] = [];
            }
            meta[currentKey].push(val);
            continue;
        }

        const colonIdx = trimmed.indexOf(":");
        if (colonIdx === -1) continue;

        const key = trimmed.slice(0, colonIdx).trim();
        currentKey = key;
        let value: any = trimmed.slice(colonIdx + 1).trim();

        if (value === "") {
            meta[key] = []; // Potential start of multi-line list
            continue;
        }

        // Remove surrounding quotes
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }

        // Parse inline arrays: [a, b, c]
        if (value.startsWith("[") && value.endsWith("]")) {
            value = value
                .slice(1, -1)
                .split(",")
                .map((s: string) => s.trim().replace(/^["']|["']$/g, ""))
                .filter(Boolean);
        }

        // Parse numbers
        if (typeof value === "string" && /^\d+(\.\d+)?$/.test(value)) {
            value = Number(value);
        }

        meta[key] = value;
    }

    return { meta, body };
}

// ── Skill cache ──────────────────────────────────────────────────────

let skillCache: Map<string, SkillMeta> = new Map();
let lastScanTime = 0;
const SCAN_COOLDOWN_MS = 5_000; // min 5s between re-scans

// ── Public API ───────────────────────────────────────────────────────

/**
 * Discover all skills in .agents/skills/
 * Returns array of SkillMeta (lightweight, no body content)
 */
export function discoverSkills(forceRescan = false): SkillMeta[] {
    const now = Date.now();
    if (!forceRescan && skillCache.size > 0 && now - lastScanTime < SCAN_COOLDOWN_MS) {
        return Array.from(skillCache.values());
    }

    if (!fs.existsSync(SKILLS_DIR)) {
        logger.debug(`[SkillLoader] Skills directory not found: ${SKILLS_DIR}`);
        return [];
    }

    const newCache = new Map<string, SkillMeta>();
    const files = fs.readdirSync(SKILLS_DIR).filter(f => f.endsWith(".md"));

    for (const file of files) {
        try {
            const filePath = path.join(SKILLS_DIR, file);
            const raw = fs.readFileSync(filePath, "utf-8");
            const { meta } = parseFrontmatter(raw);

            const skill: SkillMeta = {
                name: meta.name || file.replace(".md", ""),
                description: meta.description || "",
                version: meta.version || "1.0",
                tags: Array.isArray(meta.tags) ? meta.tags : [],
                author: meta.author || "unknown",
                priority: typeof meta.priority === "number" ? meta.priority : 50,
                filePath,
            };

            newCache.set(skill.name, skill);
        } catch (err: any) {
            logger.warn(`[SkillLoader] Failed to parse skill ${file}: ${err.message}`);
        }
    }

    skillCache = newCache;
    lastScanTime = now;

    if (newCache.size > 0) {
        const names = Array.from(newCache.keys()).join(", ");
        logger.info(`✅ [SkillLoader] Loaded ${newCache.size} skills: ${names}`);
    } else {
        logger.info(`[SkillLoader] No skills found in ${SKILLS_DIR}`);
    }

    return Array.from(newCache.values());
}

/**
 * Get full skill content (body) by name — loaded just-in-time
 */
export function getSkillContent(name: string): SkillFull | null {
    // Ensure cache is populated
    if (skillCache.size === 0) {
        discoverSkills();
    }

    const meta = skillCache.get(name);
    if (!meta) {
        logger.debug(`[SkillLoader] Skill not found: ${name}`);
        return null;
    }

    try {
        const raw = fs.readFileSync(meta.filePath, "utf-8");
        const { body } = parseFrontmatter(raw);
        return { ...meta, content: body.trim() };
    } catch (err: any) {
        logger.warn(`[SkillLoader] Failed to read skill ${name}: ${err.message}`);
        return null;
    }
}

/**
 * Get all skill names currently loaded
 */
export function getSkillNames(): string[] {
    if (skillCache.size === 0) {
        discoverSkills();
    }
    return Array.from(skillCache.keys());
}

/**
 * Get skills filtered by tag
 */
export function getSkillsByTag(tag: string): SkillMeta[] {
    if (skillCache.size === 0) {
        discoverSkills();
    }
    return Array.from(skillCache.values()).filter(s =>
        s.tags.some(t => t.toLowerCase() === tag.toLowerCase())
    );
}

// Auto-discover on import
discoverSkills();
