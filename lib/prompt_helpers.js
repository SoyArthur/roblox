function ensurePromptShape(prompt) {
  const out = prompt && typeof prompt === 'object' ? prompt : {};
  if (!out.self || typeof out.self !== 'object') out.self = {};
  if (!out.observations || typeof out.observations !== 'object') out.observations = {};
  if (!Array.isArray(out.allowed_actions)) out.allowed_actions = [];
  if (!out.behavior_contract || typeof out.behavior_contract !== 'object') out.behavior_contract = {};
  return out;
}

function augmentMovementPrompt(prompt, obs = {}) {
  const out = ensurePromptShape(prompt);
  out.self.movement = obs.movement || null;
  out.observations.ground_supplies = Array.isArray(obs.groundSupplies) ? obs.groundSupplies : [];
  out.observations.local_biome = obs.terrain?.biome || obs.biome || 'snow';
  out.observations.presence = obs.presence || null;
  out.observations.local_pressure = {
    hunger: typeof obs.hunger === 'number' ? obs.hunger : null,
    health: typeof obs.health === 'number' ? obs.health : null,
    stamina: typeof obs.stamina === 'number' ? obs.stamina : null,
    morale: typeof obs.morale === 'number' ? obs.morale : null,
    temperature: typeof obs.temperature === 'number' ? obs.temperature : null,
  };
  out.allowed_actions = Array.from(new Set([...out.allowed_actions, 'salvage', 'take', 'drop', 'swim']));
  out.behavior_contract = {
    ...out.behavior_contract,
    movement: 'Move only one tile at a time unless the current order explicitly continues. Never teleport. Replan incrementally when the local scene changes.',
    perception: 'Use biome, presence, absence, water, nearby sites, and nearby supplies as local context. Favor what is close enough to matter right now.',
    swimming: 'Water is traversable only if swimming is available. Respect step-by-step movement in water too.',
    survival: 'When there is no obvious combat or task, prefer the smallest useful survival action instead of freezing.',
  };
  return out;
}

function augmentRoleplayPrompt(prompt, obs = {}) {
  const out = ensurePromptShape(prompt);
  out.self.roleplay = {
    mode: 'in_character',
    priority: 'survival_first',
    pacing: 'active',
  };
  out.observations.roleplay_pressure = {
    hunger: typeof obs.hunger === 'number' ? obs.hunger : null,
    health: typeof obs.health === 'number' ? obs.health : null,
    stamina: typeof obs.stamina === 'number' ? obs.stamina : null,
    morale: typeof obs.morale === 'number' ? obs.morale : null,
    temperature: typeof obs.temperature === 'number' ? obs.temperature : null,
    ship_compartment: obs.ship_compartment || null,
    zone: obs.zone || null,
    goals: Array.isArray(obs.goals) ? obs.goals : [],
  };
  out.observations.roleplay_cues = {
    speech_ifsafe: 'Brief, human, and motivated by what the character can actually see or remember.',
    action_bias: 'Prefer concrete action, coordination, repair, searching, or survival. Do not stall just to wait.',
  };
  out.behavior_contract = {
    ...out.behavior_contract,
    immersion: 'Stay in character as a stranded expedition crew member. Think like someone cold, hungry, afraid, and trying to survive together.',
    initiative: 'If there is any useful local action, choose it. Avoid passively waiting unless resting, hiding, or regrouping is clearly the best move.',
    dialogue: 'Speech should sound like real crew under stress: short, specific, and tied to the scene.',
    memory: 'Use only what the character could plausibly know from the current scene, memory, rumors, and visible evidence.',
    urgency: 'Treat hunger, heat, injury, fire, flooding, and crew tension as real pressures that should shape the next move.',
  };
  return out;
}

module.exports = {
  ensurePromptShape,
  augmentMovementPrompt,
  augmentRoleplayPrompt,
};
