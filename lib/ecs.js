
const { buildShipSceneState, shipFloodingState, shipCompartmentForPosition } = require('./ship_interior');
const { ensureGoals, updateGoalProgress } = require('./goal_memory');

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}


function resolveRoleHint(agent = {}, obs = {}, world = {}) {
  return String(
    agent?.shipCompartment
    || obs?.ship_compartment
    || world?.ship?.scene?.activeCompartment
    || (typeof obs?.role_hint === 'string' ? obs.role_hint : '')
    || ''
  ).toLowerCase();
}

function computeUtilityVector(agent, world = {}, obs = {}) {
  const ship = world.ship || {};
  const shipMeta = obs.ship_meta || {};
  const flooding = ship.flooding || {};
  const maxFlood = Math.max(0, ...Object.values(flooding).map((n) => Number(n) || 0));
  const shipIntegrity = Number(ship.integrity ?? 100) / 100;
  const boiler = Number(ship.boilerHeat ?? 0) / 100;
  const health = Number(agent.health ?? 100) / 100;
  const hunger = Number(agent.hunger ?? 0) / 100;
  const stamina = Number(agent.stamina ?? 100) / 100;
  const morale = Number(agent.morale ?? 0.5);
  const visible = Array.isArray(obs.visible_entities) ? obs.visible_entities : [];
  const threat = visible.some((e) => e.current_action === 'attack' || e.current_action === 'sabotage' || e.imprisoned) ? 1 : 0;
  const evidenceCount = Number(shipMeta.evidence?.total ?? (Array.isArray(world.evidence) ? world.evidence.length : 0));
  const fireTotal = Number(shipMeta.fire?.total ?? 0);
  const mutinyRisk = Number(shipMeta.mutiny?.risk ?? world.mutiny?.risk ?? 0);
  const radioSignal = Number(shipMeta.radio?.signal ?? ship.radio?.signal ?? 0);
  const roleHint = resolveRoleHint(agent, obs, world);

  const vector = {
    survive: clamp(0.42 * health + 0.23 * stamina + 0.2 * (1 - hunger) + 0.15 * morale, 0, 1),
    ship: clamp(0.45 * shipIntegrity + 0.28 * boiler + 0.27 * (1 - maxFlood), 0, 1),
    social: clamp(0.35 * morale + 0.3 * (1 - threat) + 0.15 * (1 - hunger) + 0.2 * radioSignal, 0, 1),
    conceal: clamp((agent.role === 'traitor' ? 0.74 : 0.26) + (agent.stealth ?? 0.5) * 0.18 + (1 - morale) * 0.12 + (evidenceCount > 0 ? 0.05 : 0), 0, 1),
    sabotage: clamp((agent.role === 'traitor' ? 0.68 : 0.05) + (1 - shipIntegrity) * 0.1 + maxFlood * 0.08 + fireTotal * 0.05 + (mutinyRisk > 0.4 ? 0.05 : 0), 0, 1),
    repair: clamp((agent.traits?.repair || 1) * 0.25 + (1 - shipIntegrity) * 0.45 + (1 - maxFlood) * 0.1 + (fireTotal > 0 ? 0.12 : 0), 0, 1),
    explore: clamp(0.18 + (agent.alertness ?? 0.5) * 0.28 + (visible.length ? 0.22 : 0.35) + (evidenceCount > 0 ? 0.05 : 0), 0, 1),
    command: clamp((agent.profession === 'Captain' ? 0.62 : 0.18) + morale * 0.2 + (mutinyRisk > 0.35 ? 0.08 : 0), 0, 1),
    stealth: clamp((agent.stealth ?? 0.5) * 0.72 + (1 - maxFlood) * 0.08 + (visible.length ? 0.04 : 0), 0, 1),
    aggression: clamp((agent.role === 'traitor' ? 0.82 : 0.22) + threat * 0.15 + (evidenceCount > 2 ? 0.04 : 0), 0, 1),
    investigation: clamp(Math.min(1, evidenceCount * 0.08 + fireTotal * 0.12 + mutinyRisk * 0.18 + (radioSignal > 0.35 ? 0.06 : 0)), 0, 1),
    coordination: clamp(0.2 + radioSignal * 0.45 + ((roleHint === 'bridge' || roleHint === 'helm') ? 0.12 : 0), 0, 1),
  };
  return vector;
}

function updateAgentEcsState(agent, world = {}, obs = {}) {
  if (!agent) return null;
  const utilities = computeUtilityVector(agent, world, obs);
  agent.utility = utilities;
  if (agent.memory) agent.memory.utility = utilities;
  const goals = updateGoalProgress(agent, world, obs);
  agent.goalSnapshot = goals.map((g) => ({
    id: g.id,
    label: g.label,
    progress: g.progress,
    priority: g.priority,
    hidden: g.hidden,
    completed: g.completed,
  }));
  agent.primaryGoal = goals
    .slice()
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))[0] || null;
  return agent;
}

function createEcsSnapshot(world = {}, agents = [], obsByAgent = new Map()) {
  return {
    tick: world.tick ?? 0,
    ship: {
      integrity: Number(world.ship?.integrity ?? 0),
      boilerHeat: Number(world.ship?.boilerHeat ?? 0),
      pressure: Number(world.ship?.pressure ?? 0),
      flooding: shipFloodingState(world),
    },
    entities: agents.map((agent) => {
      const obs = obsByAgent.get(agent.id) || {};
      const compartment = agent.onShip ? shipCompartmentForPosition(agent.position, world)?.id || agent.shipCompartment || null : null;
      return {
        id: agent.id,
        kind: 'agent',
        components: {
          position: agent.position ? { x: Math.round(agent.position.x), y: Math.round(agent.position.y) } : null,
          alive: Boolean(agent.alive),
          onShip: Boolean(agent.onShip),
          compartment,
          role: agent.role,
          profession: agent.profession,
          utility: agent.utility || null,
          goals: agent.goalSnapshot || [],
          visibility: agent.onShip ? (obs.ship_visibility || null) : null,
          inventory: agent.inventory || null,
          needs: {
            health: Number(agent.health ?? 0),
            hunger: Number(agent.hunger ?? 0),
            stamina: Number(agent.stamina ?? 0),
            morale: Number(agent.morale ?? 0),
          },
        },
      };
    }),
    shipScene: buildShipSceneState(world, agents, agents.find((a) => a.alive) || null),
  };
}

function runEcsSystems(world = {}, agents = [], obsByAgent = new Map()) {
  const snapshot = createEcsSnapshot(world, agents, obsByAgent);
  for (const agent of agents) {
    const obs = obsByAgent.get(agent.id) || {};
    updateAgentEcsState(agent, world, obs);
    if (agent.onShip && !agent.shipCompartment) {
      const comp = shipCompartmentForPosition(agent.position, world);
      if (comp) agent.shipCompartment = comp.id;
    }
    if (agent.onShip && agent.position) {
      agent.position.y = shipCompartmentForPosition(agent.position, world)?.laneY ?? agent.position.y;
    }
  }
  world.ecs = snapshot;
  return snapshot;
}

module.exports = {
  computeUtilityVector,
  updateAgentEcsState,
  createEcsSnapshot,
  runEcsSystems,
};
