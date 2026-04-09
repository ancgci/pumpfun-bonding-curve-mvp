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

const SKILLS_ROOT_DIR = path.join(process.cwd(), ".agents/skills");
const CUSTOM_SKILLS_DIR = path.join(SKILLS_ROOT_DIR, "custom");

interface SkillCandidate {
    filePath: string;
    loadPriority: number;
}

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

    if (!fs.existsSync(SKILLS_ROOT_DIR)) {
        logger.debug(`[SkillLoader] Skills directory not found: ${SKILLS_ROOT_DIR}`);
        return [];
    }

    const selectedSkills = new Map<string, { skill: SkillMeta; loadPriority: number }>();
    const files = discoverSkillFiles();

    for (const candidate of files) {
        try {
            const filePath = candidate.filePath;
            const raw = fs.readFileSync(filePath, "utf-8");
            const { meta } = parseFrontmatter(raw);
            const skillName = getSkillName(meta, filePath);

            const skill: SkillMeta = {
                name: skillName,
                description: meta.description || "",
                version: meta.version || "1.0",
                tags: Array.isArray(meta.tags) ? meta.tags : [],
                author: meta.author || "unknown",
                priority: typeof meta.priority === "number" ? meta.priority : 50,
                filePath,
            };

            const existing = selectedSkills.get(skill.name);
            if (!existing || candidate.loadPriority >= existing.loadPriority) {
                if (existing) {
                    logger.info(
                        `[SkillLoader] Overriding skill '${skill.name}' from ${toSkillRelativePath(existing.skill.filePath)} with ${toSkillRelativePath(filePath)}`
                    );
                }
                selectedSkills.set(skill.name, { skill, loadPriority: candidate.loadPriority });
            }
        } catch (err: any) {
            logger.warn(`[SkillLoader] Failed to parse skill ${toSkillRelativePath(candidate.filePath)}: ${err.message}`);
        }
    }

    skillCache = new Map(
        Array.from(selectedSkills.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([name, entry]) => [name, entry.skill])
    );
    lastScanTime = now;

    if (skillCache.size > 0) {
        const names = Array.from(skillCache.keys()).join(", ");
        logger.info(`✅ [SkillLoader] Loaded ${skillCache.size} skills: ${names}`);
    } else {
        logger.info(`[SkillLoader] No skills found in ${SKILLS_ROOT_DIR}`);
    }

    return Array.from(skillCache.values());
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

function discoverSkillFiles(): SkillCandidate[] {
    const candidates: SkillCandidate[] = [];
    walkSkillTree(SKILLS_ROOT_DIR, candidates);

    return candidates.sort((a, b) => {
        if (a.loadPriority !== b.loadPriority) {
            return a.loadPriority - b.loadPriority;
        }
        return a.filePath.localeCompare(b.filePath);
    });
}

function walkSkillTree(dir: string, candidates: SkillCandidate[]): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;

        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            walkSkillTree(fullPath, candidates);
            continue;
        }

        const candidate = toSkillCandidate(fullPath);
        if (candidate) {
            candidates.push(candidate);
        }
    }
}

function toSkillCandidate(filePath: string): SkillCandidate | null {
    const baseName = path.basename(filePath);
    if (baseName === "SKILL.md") {
        return { filePath, loadPriority: 20 };
    }

    if (!filePath.endsWith(".md")) {
        return null;
    }

    const parentDir = path.dirname(filePath);
    if (parentDir === SKILLS_ROOT_DIR) {
        return { filePath, loadPriority: 10 };
    }

    if (isPathInside(filePath, CUSTOM_SKILLS_DIR)) {
        return { filePath, loadPriority: 30 };
    }

    return null;
}

function getSkillName(meta: Record<string, any>, filePath: string): string {
    if (typeof meta.name === "string" && meta.name.trim().length > 0) {
        return meta.name.trim();
    }

    const baseName = path.basename(filePath);
    if (baseName === "SKILL.md") {
        return path.basename(path.dirname(filePath));
    }

    return baseName.replace(/\.md$/i, "");
}

function isPathInside(filePath: string, rootDir: string): boolean {
    const relative = path.relative(rootDir, filePath);
    return relative.length > 0 && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toSkillRelativePath(filePath: string): string {
    return path.relative(process.cwd(), filePath) || filePath;
}
