
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(16).slice(2, 10)}`;
}

function nowTs() {
  return Date.now();
}

function normalizeGoal(goal) {
  if (!goal) return null;
  if (typeof goal === 'string') {
    return {
      id: uid('goal'),
      label: goal,
      kind: 'generic',
      progress: 0,
      priority: 0.5,
      hidden: false,
      createdAt: nowTs(),
      updatedAt: nowTs(),
      completed: false,
    };
  }
  if (typeof goal !== 'object') return null;
  const label = String(goal.label || goal.name || goal.id || '').trim();
  if (!label) return null;
  return {
    id: String(goal.id || uid('goal')),
    label,
    kind: String(goal.kind || 'generic'),
    progress: clamp(Number(goal.progress ?? 0), 0, 1),
    priority: clamp(Number(goal.priority ?? 0.5), 0, 1),
    hidden: Boolean(goal.hidden),
    source: goal.source || null,
    target: goal.target || null,
    createdAt: Number(goal.createdAt || nowTs()),
    updatedAt: Number(goal.updatedAt || nowTs()),
    completed: Boolean(goal.completed),
  };
}

function initMemory() {
  return {
    memories: [],
    suspicions: {},
    relationships: {},
    goals: [],
    goalState: {},
    hiddenGoals: [],
    utility: {},
    promises: [],
    notes: [],
  };
}

function addMemory(memory, text, type = 'note', meta = {}) {
  if (!memory || !Array.isArray(memory.memories)) return null;
  const entry = {
    id: uid('mem'),
    ts: nowTs(),
    type,
    text: String(text || '').slice(0, 300),
    meta: meta && typeof meta === 'object' ? { ...meta } : {},
  };
  memory.memories.push(entry);
  while (memory.memories.length > 50) memory.memories.shift();
  return entry;
}

function ensureGoals(agent, world = {}, context = {}) {
  if (!agent) return [];
  if (!agent.memory || typeof agent.memory !== 'object') agent.memory = initMemory();
  const mem = agent.memory;
  const visible = new Set(Array.isArray(mem.goals) ? mem.goals.map((g) => String(g)) : []);
  const push = (label) => { if (label) visible.add(String(label)); };

  push('Survive the expedition');
  push('Keep the ship operational');
  push('Stay warm');
  push('Build trust with the crew');
  push('Identify threats');

  const ship = world.ship || {};
  if ((ship.integrity ?? 100) < 60) push('Repair hull damage');
  if ((ship.boilerHeat ?? 0) < 35) push('Restore boiler heat');
  if ((ship.flooding && typeof ship.flooding === 'object')) {
    const highestFlood = Math.max(0, ...Object.values(ship.flooding).map((n) => Number(n) || 0));
    if (highestFlood > 0.35) push('Contain flooding');
  }

  const hunger = Number(context.hunger ?? agent.hunger ?? 0);
  const stamina = Number(context.stamina ?? agent.stamina ?? 100);
  const morale = Number(context.morale ?? agent.morale ?? 0.5);
  if (hunger > 0.55) push('Find food');
  if (stamina < 45) push('Rest and recover');
  if (morale < 0.35) push('Regain confidence');

  if (agent.role === 'traitor') {
    mem.hiddenGoals = Array.isArray(mem.hiddenGoals) ? mem.hiddenGoals : [];
    const hidden = [
      'Undermine the ship quietly',
      'Turn crew against each other',
      'Create isolated opportunities',
      'Keep sabotage hidden',
    ];
    for (const goal of hidden) {
      if (!mem.hiddenGoals.includes(goal)) mem.hiddenGoals.push(goal);
    }
  }

  const normalized = Array.from(visible).map((label) => {
    const prev = mem.goalState[label] || {};
    return normalizeGoal({
      ...prev,
      id: prev.id || uid('goal'),
      label,
      hidden: false,
      completed: Boolean(prev.completed),
      progress: Number(prev.progress ?? 0),
      priority: Number(prev.priority ?? 0.5),
      createdAt: prev.createdAt || nowTs(),
      updatedAt: nowTs(),
    });
  });

  mem.goals = normalized.map((g) => g.label);
  const state = {};
  for (const goal of normalized) state[goal.label] = goal;
  mem.goalState = state;
  return normalized;
}

function updateGoalProgress(agent, world = {}, obs = {}) {
  if (!agent?.memory) return [];
  const mem = agent.memory;
  const goals = ensureGoals(agent, world, obs);
  for (const goal of goals) {
    const label = goal.label.toLowerCase();
    let progress = goal.progress || 0;
    if (label.includes('survive')) progress = clamp((agent.health / 100) * 0.45 + (agent.stamina / 100) * 0.25 + (1 - agent.hunger / 100) * 0.3, 0, 1);
    else if (label.includes('ship operational') || label.includes('repair hull') || label.includes('boiler')) {
      const ship = world.ship || {};
      progress = clamp(((ship.integrity ?? 100) / 100) * 0.4 + ((ship.boilerHeat ?? 0) / 100) * 0.3 + (1 - Math.max(0, ...Object.values(ship.flooding || { x: 0 }).map((n) => Number(n) || 0))) * 0.3, 0, 1);
    } else if (label.includes('trust')) {
      progress = clamp(0.5 + (agent.morale - 0.5) * 0.6, 0, 1);
    } else if (label.includes('threat')) {
      const visible = Array.isArray(obs.visible_entities) ? obs.visible_entities : [];
      progress = clamp(0.35 + Math.min(0.65, visible.some((e) => e.current_action === 'attack' || e.current_action === 'sabotage') ? 0.35 : 0.1), 0, 1);
    } else if (label.includes('food')) {
      progress = clamp(1 - (agent.hunger / 100), 0, 1);
    } else if (label.includes('rest')) {
      progress = clamp((agent.stamina / 100), 0, 1);
    } else if (label.includes('flood')) {
      const ship = world.ship || {};
      const flood = Math.max(0, ...Object.values(ship.flooding || { x: 0 }).map((n) => Number(n) || 0));
      progress = clamp(1 - flood, 0, 1);
    }
    goal.progress = progress;
    goal.priority = clamp((goal.priority ?? 0.5) * 0.8 + (1 - progress) * 0.2, 0, 1);
    goal.updatedAt = nowTs();
    goal.completed = progress >= 0.98;
    mem.goalState[goal.label] = goal;
  }
  return goals;
}

function summarizeMemory(agent) {
  const memories = (agent?.memory?.memories || []).slice(-8).map((m) => `- ${m.text}`);
  const suspicions = Object.entries(agent?.memory?.suspicions || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => `${id}:${Number(score).toFixed(2)}`);
  const relationships = Object.entries(agent?.memory?.relationships || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, score]) => `${id}:${Number(score).toFixed(2)}`);
  const goals = Array.isArray(agent?.memory?.goals) ? agent.memory.goals.slice(0, 6) : [];
  return {
    memories,
    suspicions,
    relationships,
    goals,
    hiddenGoals: Array.isArray(agent?.memory?.hiddenGoals) ? agent.memory.hiddenGoals.slice(0, 6) : [],
    utility: agent?.memory?.utility || {},
  };
}

module.exports = {
  initMemory,
  addMemory,
  ensureGoals,
  updateGoalProgress,
  summarizeMemory,
  normalizeGoal,
};
