import logger from "./logger";
import {
    discoverSkills,
    getSkillContent,
    getSkillsByTag,
    SkillMeta,
    SkillFull,
} from "./skillLoader";

/**
 * SKILL REGISTRY
 *
 * Central registry that manages skill selection and prompt injection.
 * Works with the SkillLoader to provide the right skills at the right time.
 *
 * Responsibilities:
 *   - Select relevant skills based on context (tags, priority)
 *   - Format skill instructions for LLM prompt injection
 *   - Enable/disable skills at runtime
 *   - Provide a summary catalog for the agent's system prompt
 */

// ── Types ────────────────────────────────────────────────────────────

export interface SkillContext {
    /** Current action the agent is performing */
    action: "token_analysis" | "risk_check" | "trade_decision" | "post_trade" | "general";
    /** Optional tags to filter skills */
    tags?: string[];
    /** Maximum number of skills to inject (to avoid prompt bloat) */
    maxSkills?: number;
}

// ── Runtime state ────────────────────────────────────────────────────

/** Skills explicitly disabled at runtime (by name) */
const disabledSkills = new Set<string>();

// ── Public API ───────────────────────────────────────────────────────

/**
 * Get formatted prompt text with all relevant skills for the given context.
 * This is the main function called by agentOrchestrator.
 */
export function getActiveSkillsPrompt(context: SkillContext): string {
    const skills = getRelevantSkills(context);

    if (skills.length === 0) {
        return "";
    }

    const skillBlocks = skills
        .map(skill => {
            return [
                `=== SKILL: ${skill.name} (v${skill.version}) ===`,
                skill.content,
                `=== END SKILL: ${skill.name} ===`,
            ].join("\n");
        })
        .join("\n\n");

    const injectedNames = skills.map(s => s.name).join(", ");
    logger.info(`[Skills] Injecting ${skills.length} skills: ${injectedNames}`);

    return `\n\n──── ACTIVE SKILLS ────\nThe following specialized skills are loaded. Follow their instructions:\n\n${skillBlocks}\n──── END SKILLS ────`;
}

/**
 * Get relevant skills for a given context, sorted by priority.
 */
export function getRelevantSkills(context: SkillContext): SkillFull[] {
    const maxSkills = context.maxSkills || 5;

    // Get all available skills
    let candidates: SkillMeta[];

    if (context.tags && context.tags.length > 0) {
        // Filter by requested tags
        const tagSet = new Set(context.tags.map(t => t.toLowerCase()));
        candidates = discoverSkills().filter(skill =>
            !disabledSkills.has(skill.name) &&
            skill.tags.some(t => tagSet.has(t.toLowerCase()))
        );
    } else {
        // Use all enabled skills
        candidates = discoverSkills().filter(skill => !disabledSkills.has(skill.name));
    }

    // Sort by priority (lower number = higher priority)
    candidates.sort((a, b) => a.priority - b.priority);

    // Limit count
    const selected = candidates.slice(0, maxSkills);

    // Load full content for selected skills
    const fullSkills: SkillFull[] = [];
    for (const meta of selected) {
        const full = getSkillContent(meta.name);
        if (full && full.content) {
            fullSkills.push(full);
        }
    }

    return fullSkills;
}

/**
 * Get a compact catalog string listing all available skills.
 * Useful for the agent to know what skills exist.
 */
export function getSkillCatalog(): string {
    const skills = discoverSkills();
    if (skills.length === 0) return "No skills loaded.";

    return skills
        .sort((a, b) => a.priority - b.priority)
        .map(s => {
            const status = disabledSkills.has(s.name) ? "❌" : "✅";
            return `${status} ${s.name} (v${s.version}) — ${s.description} [tags: ${s.tags.join(", ")}]`;
        })
        .join("\n");
}

/**
 * Disable a skill at runtime (will not be injected into prompts).
 */
export function disableSkill(name: string): void {
    disabledSkills.add(name);
    logger.info(`[SkillRegistry] Disabled skill: ${name}`);
}

/**
 * Enable a previously disabled skill.
 */
export function enableSkill(name: string): void {
    disabledSkills.delete(name);
    logger.info(`[SkillRegistry] Enabled skill: ${name}`);
}

/**
 * Check if a skill is currently enabled.
 */
export function isSkillEnabled(name: string): boolean {
    return !disabledSkills.has(name);
}

/**
 * Get list of all disabled skills.
 */
export function getDisabledSkills(): string[] {
    return Array.from(disabledSkills);
}

logger.info("✅ Skill Registry initialized");
