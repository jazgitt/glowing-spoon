// The brigade — one persona per engine agent. Colors track the chalk prefixes in
// utils/output.js so the live log and the avatars speak the same language.
export const AGENTS = {
  'agent-pm': {
    name: 'Maestro', emoji: '🎩', role: 'Head chef', color: '#ffb648',
    flavor: ['orchestrating the kitchen…', 'reading your notes…', 'planning the menu…'],
  },
  'spec-agent': {
    name: 'Scribbles', emoji: '📝', role: 'Spec writer', color: '#5b9dff',
    flavor: ['sketching the blueprint…', 'turning ideas into specs…', 'sharpening pencils…'],
  },
  'dev-agent': {
    name: 'Forge', emoji: '🔨', role: 'Developer', color: '#4ade80',
    flavor: ['hammering out your code…', 'welding functions together…', 'in the zone, do not disturb…'],
  },
  'integration-agent': {
    name: 'Patch', emoji: '🔌', role: 'Integrations', color: '#2dd4bf',
    flavor: ['wiring up third-party services…', 'reading API docs so you don’t have to…'],
  },
  'review-agent': {
    name: 'Hawk', emoji: '🔍', role: 'Code reviewer', color: '#e879f9',
    flavor: ['squinting at every line…', 'finding what others missed…', 'raising an eyebrow…'],
  },
  'qa-agent': {
    name: 'Zapp', emoji: '⚡', role: 'QA tester', color: '#facc15',
    flavor: ['zapping bugs…', 'trying to break things (professionally)…', 'clicking every button twice…'],
  },
  'docs-agent': {
    name: 'Quill', emoji: '🖋️', role: 'Docs writer', color: '#c4b5fd',
    flavor: ['writing it all down…', 'making it make sense…'],
  },
  'cost-agent': {
    name: 'Penny', emoji: '🪙', role: 'Cost analyst', color: '#22d3ee',
    flavor: ['counting every token…', 'doing the math…'],
  },
  'compliance-agent': {
    name: 'Warden', emoji: '🛡️', role: 'Compliance', color: '#fb7185',
    flavor: ['checking the rulebook…', 'reading the fine print…'],
  },
  'pitch-agent': {
    name: 'Spark', emoji: '✨', role: 'Pitch writer', color: '#f472b6',
    flavor: ['polishing the pitch…', 'finding the magic words…'],
  },
  'teardown-agent': {
    name: 'Crowbar', emoji: '🧰', role: 'Teardown analyst', color: '#fb923c',
    flavor: ['comparing you to the competition…', 'prying open the numbers…'],
  },
  'assembler-agent': {
    name: 'Platter', emoji: '🍽️', role: 'Assembler', color: '#a3e635',
    flavor: ['plating the final dish…', 'wiring everything into one app…', 'checking it actually runs…'],
  },
};

export const UNKNOWN_AGENT = {
  name: 'Crew', emoji: '🤖', role: 'Agent', color: '#9c94c0', flavor: ['working…'],
};

export function agentInfo(agentId) {
  return AGENTS[agentId] ?? { ...UNKNOWN_AGENT, name: agentId ?? 'Crew' };
}

// Log prefixes that aren't agents but still deserve a color in the live feed.
export const LOG_PREFIX_COLORS = {
  session: '#f1edff',
  resume: '#f1edff',
  quality: '#5b9dff',
  cost: '#9c94c0',
  skills: '#6b6390',
  workspace: '#f1edff',
  PENDING: '#ffb648',
  BLOCKED: '#fb7185',
  ERROR: '#fb7185',
  WARN: '#ffb648',
  '✓': '#4ade80',
};

// Idle-state lines for the waiting scene.
export const KITCHEN_QUIET = [
  'The kitchen is quiet.',
  'Burners off. Spoons polished.',
  'The brigade is on break.',
];
