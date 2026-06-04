
const SHIP_ALLOWED_ACTIONS = [
  'wait',
  'move',
  'move_to_zone',
  'move_room',
  'patrol',
  'follow',
  'escort',
  'track',
  'inspect',
  'inspect_room',
  'hide',
  'whisper',
  'shout',
  'speak',
  'search',
  'open_door',
  'close_door',
  'lock_door',
  'unlock_door',
  'seal',
  'pump',
  'repair',
  'refuel',
  'sabotage',
  'sabotage_ship',
  'sabotage_door',
  'attack',
  'heal',
  'tend',
  'share',
  'steal',
  'imprison',
  'free',
  'brew',
  'set_trap',
  'deploy',
  'signal',
  'curse',
  'bury',
  'investigate',
  'fortify',
  'report',
  'radio',
  'inspect_system',
  'reroute_power',
  'extinguish_fire',
  'start_fire',
  'rally',
  'appease',
  'mutiny',
  'swim',
];

function ensurePromptActions(prompt) {
  if (!prompt || typeof prompt !== 'object') return prompt;
  if (!Array.isArray(prompt.allowed_actions)) prompt.allowed_actions = [];
  prompt.allowed_actions = Array.from(new Set([...(prompt.allowed_actions || []), ...SHIP_ALLOWED_ACTIONS]));
  prompt.behavior_contract = {
    ...(prompt.behavior_contract || {}),
    speech_vs_thought: 'Thought is private intention. Speech is audible to others. Keep them distinct.',
    locality: 'Use only local perception, memory, goals, and the current scene state.',
    capabilities: 'The prompt describes what the agent can do, not what it must do.',
    interior_navigation: 'When inside the ship, reason in compartments, doors, flood levels, sound, and line-of-sight.',
    stealth: 'Use silence, hiding, closed doors, and compartment choice to avoid witnesses.',
    evidence: 'Treat evidence as a local, witness-driven signal of what actually happened.',
    radio: 'Radio is separate from speech: it reaches channels rather than only nearby ears.',
    mutiny: 'Mutiny is a crew pressure system, not a random action.',
  };
  return prompt;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function shipActionRank(agent, obs = {}) {
  const utilities = agent?.utility || {};
  const isShip = Boolean(agent?.onShip || obs.ship_scene || obs.ship_state);
  const comp = obs.ship_compartment || agent?.shipCompartment || null;
  const visibleThreat = Array.isArray(obs.visible_entities) ? obs.visible_entities.some((e) => e.current_action === 'attack' || e.current_action === 'sabotage') : false;
  const flood = obs.ship_visibility?.flood?.[comp] || obs.ship_state?.flooding?.[comp] || 0;
  const fire = obs.ship_state?.fire?.compartments?.[comp] || obs.ship_meta?.fire?.total || 0;
  const power = obs.ship_state?.power?.grid?.[comp] ?? obs.ship_state?.power?.reserve ?? 0.5;
  const mutiny = obs.ship_meta?.mutiny?.risk || 0;
  return {
    repair: clamp((utilities.repair || 0) + (flood > 0.2 ? 0.25 : 0) + (power < 0.4 ? 0.1 : 0), 0, 1),
    sabotage: clamp((utilities.sabotage || 0) + (agent?.role === 'traitor' ? 0.25 : 0) + (visibleThreat ? 0.1 : 0) + (fire > 0 ? 0.05 : 0), 0, 1),
    conceal: clamp((utilities.conceal || 0) + (agent?.stealth || 0) * 0.1, 0, 1),
    social: clamp((utilities.social || 0) + (isShip ? 0.05 : 0) + (mutiny > 0.35 ? 0.08 : 0), 0, 1),
    explore: clamp((utilities.explore || 0) + (obs.ship_scene ? 0.1 : 0), 0, 1),
    power: clamp((power < 0.55 ? 0.7 : 0.2), 0, 1),
    fire: clamp(fire > 0 ? 0.75 : 0.15, 0, 1),
  };
}

function suggestShipFallbackAction(agent, obs = {}) {
  const rank = shipActionRank(agent, obs);
  if (agent?.role === 'traitor' && rank.sabotage > 0.55) {
    return { type: 'sabotage_ship', target: obs.ship_compartment || agent.shipCompartment || null };
  }
  if (rank.fire > 0.7 && (agent?.role !== 'traitor' || Math.random() < 0.6)) return { type: 'extinguish_fire', compartment: obs.ship_compartment || agent.shipCompartment || null };
  if (rank.power > 0.6 && agent?.profession === 'Engineer') return { type: 'reroute_power', compartment: obs.ship_compartment || agent.shipCompartment || null };
  if (rank.repair > 0.7) return { type: 'repair' };
  if (rank.conceal > 0.65 && (agent?.role === 'traitor' || (agent?.stealth ?? 0) > 0.6)) return { type: 'hide' };
  if (rank.social > 0.65 && Array.isArray(obs.visible_entities) && obs.visible_entities.length) return { type: 'whisper', target: obs.visible_entities[0].id };
  if (rank.explore > 0.7) return { type: 'inspect_room' };
  return null;
}

function normalizeActionShape(raw = {}) {
  if (!raw || typeof raw !== 'object') return { type: 'wait' };
  const action = { type: typeof raw.type === 'string' ? raw.type : 'wait' };
  for (const key of ['target', 'item', 'amount', 'steps', 'message', 'room', 'compartment', 'door', 'mode', 'channel']) {
    if (raw[key] != null) action[key] = raw[key];
  }
  return action;
}

function isShipAction(type) {
  return SHIP_ALLOWED_ACTIONS.includes(String(type || ''));
}

module.exports = {
  SHIP_ALLOWED_ACTIONS,
  ensurePromptActions,
  shipActionRank,
  suggestShipFallbackAction,
  normalizeActionShape,
  isShipAction,
};
