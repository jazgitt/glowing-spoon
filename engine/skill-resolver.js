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
      const versionMatch = content.match(/^version:\s*(.+)$/m);
      const whenMatch = content.match(/## When to invoke\n([\s\S]*?)(?=\n##|$)/);
      skills.push({
        filename: file,
        skill: skillMatch?.[1]?.trim() ?? file,
        version: versionMatch?.[1]?.trim() ?? '1.0',
        when: whenMatch?.[1]?.trim() ?? '',
      });
    }
    return skills;
  } catch {
    return [];
  }
}

// Loads the full content of specific skill files.
export async function loadSkillContents(agentId, skillFilenames, snapshot = {}) {
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

  try {
    const text = response.content[0].text.trim();
    const parsed = JSON.parse(text.match(/\[[\s\S]*\]/)?.[0] ?? text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed.skills) return parsed.skills;
  } catch {
    // Fall back to all skills if parse fails
  }
  return available.map(s => s.filename);
}
