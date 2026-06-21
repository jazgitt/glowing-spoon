import fs from 'fs/promises';
import path from 'path';
import { callClaude } from '../utils/claude.js';

const AGENTS_DIR = new URL('../agents', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');

// Lists available skills for an agent by reading frontmatter only.
async function listSkills(agentId) {
  const skillsDir = path.join(AGENTS_DIR, agentId, 'skills');
  try {
    const files = await fs.readdir(skillsDir);
    const skills = [];
    for (const file of files.filter(f => f.endsWith('.md'))) {
      const content = await fs.readFile(path.join(skillsDir, file), 'utf8');
      const skillMatch = content.match(/^skill:\s*(.+)$/m);
      const whenMatch = content.match(/## When to invoke\n([\s\S]*?)(?=\n##|$)/);
      skills.push({
        filename: file,
        skill: skillMatch?.[1]?.trim() ?? file,
        when: whenMatch?.[1]?.trim() ?? '',
      });
    }
    return skills;
  } catch {
    return [];
  }
}

// Loads the full content of specific skill files.
export async function loadSkillContents(agentId, skillFilenames) {
  const skillsDir = path.join(AGENTS_DIR, agentId, 'skills');
  const contents = [];
  for (const filename of skillFilenames) {
    const filePath = path.join(skillsDir, filename);
    try {
      contents.push(await fs.readFile(filePath, 'utf8'));
    } catch {
      // Skill file missing — skip
    }
  }
  return contents.join('\n\n---\n\n');
}

// Uses Haiku to match task description to relevant skill files.
export async function resolveSkills(agentId, taskDescription, session) {
  const available = await listSkills(agentId);
  if (available.length === 0) return [];

  const skillList = available
    .map(s => `${s.filename}: ${s.when}`)
    .join('\n');

  const response = await callClaude({
    systemPrompt: 'You are a skill selector. Given a task description and available skills, return ONLY a JSON array of the skill filenames that apply. No explanation.',
    userPrompt: `Task: ${taskDescription}\n\nAvailable skills:\n${skillList}\n\nReturn JSON array of filenames.`,
    agentId: 'skill-resolver',
    tenantId: session.tenantId,
    projectId: session.projectId,
    sessionId: session.sessionId,
    dryRun: session.dryRun,
  });

  const availableFilenames = new Set(available.map(s => s.filename));
  try {
    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? text);
    const candidates = Array.isArray(parsed) ? parsed : (parsed.skills ?? []);
    const safe = candidates.filter(f => availableFilenames.has(f));
    if (safe.length > 0) return safe;
  } catch {
    // Fall back to all skills if parse fails
  }
  return available.map(s => s.filename);
}
