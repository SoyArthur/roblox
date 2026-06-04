function dist(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.y ?? 0) - (b.y ?? 0));
}

function summarizePresence({ agents = [], origin = null, selfId = null, radius = 8 }) {
  if (!origin) return { nearby: [], counts: { allies: 0, hostiles: 0, imprisoned: 0, empty: 0, absent: 0 } };
  const nearby = agents
    .filter((other) => other && other.alive && other.id !== selfId && dist(origin, other.position) <= radius)
    .map((other) => ({
      id: other.id,
      name: other.name,
      profession: other.profession,
      role: other.role,
      distance: Number(dist(origin, other.position).toFixed(2)),
      direction: typeof other.direction === 'function' ? other.direction(origin, other.position) : null,
      imprisoned: Boolean(other.imprisoned),
      alive: Boolean(other.alive),
      action: other.currentAction || 'idle',
    }))
    .sort((a, b) => a.distance - b.distance);

  const counts = {
    allies: nearby.filter((n) => n.role !== 'traitor').length,
    hostiles: nearby.filter((n) => n.role === 'traitor').length,
    imprisoned: nearby.filter((n) => n.imprisoned).length,
    empty: Math.max(0, Math.round(Math.PI * radius * radius) - nearby.length),
    absent: Math.max(0, agents.filter((a) => a && a.alive).length - nearby.length - 1),
  };

  return { nearby, counts };
}

function buildWorldSot({
  world,
  agents = [],
  agent = null,
  position = null,
  route = [],
  expeditionSites = [],
  biomeAtPoint = () => 'snow',
  biomeCountsAround = () => ({}),
  zoneLabelForPosition = () => null,
  tileBlocked = () => false,
  distFn = dist,
  routeDistance = 10,
}) {
  const focus = position || agent?.position || world?.ship?.position || { x: 0, y: 0 };
  const biome = biomeAtPoint(focus);
  const neighborhood = biomeCountsAround(focus, 2);
  const presence = summarizePresence({ agents, origin: focus, selfId: agent?.id || null, radius: 8 });
  const nearestBiomes = Object.entries(neighborhood).sort((a, b) => b[1] - a[1]);
  const nearbySites = expeditionSites
    .filter((site) => distFn(focus, site) <= routeDistance)
    .map((site) => ({
      id: site.id,
      name: site.name,
      kind: site.kind,
      threat: site.threat,
      discovered: Boolean(world?.expedition?.discovered?.includes(site.id)),
      distance: Number(distFn(focus, site).toFixed(2)),
    }))
    .sort((a, b) => a.distance - b.distance);

  const localZone = zoneLabelForPosition(focus) || null;
  const waterHere = biome === 'water';
  const blocked = tileBlocked(Math.round(focus.x), Math.round(focus.y));

  return {
    tick: world?.tick ?? 0,
    day: world?.day ?? 1,
    phase: world?.phase || 'lobby',
    weather: {
      label: world?.weatherLabel || 'calm',
      storm: Number(world?.storm ?? 0),
      temperature: Math.round(world?.temperature ?? 0),
      terror: Number(world?.terror ?? 0),
    },
    ship: {
      position: world?.ship?.position ? { ...world.ship.position } : null,
      worldPosition: world?.ship?.worldPosition ? { ...world.ship.worldPosition } : null,
      canDisembark: Boolean(world?.ship?.canDisembark),
      integrity: world?.ship?.integrity ?? 0,
      boilerHeat: world?.ship?.boilerHeat ?? 0,
      fuel: world?.ship?.fuel ?? 0,
      helmHealth: world?.ship?.helmHealth ?? 0,
      pressure: Number(world?.ship?.pressure ?? 0),
    },
    overworld: world?.overworld ? {
      route: Array.isArray(world.overworld.route) ? world.overworld.route.slice() : [],
      routeIndex: world.overworld.routeIndex ?? 0,
      voyageProgress: world.overworld.voyageProgress ?? 0,
      shipPosition: world.overworld.shipPosition ? { ...world.overworld.shipPosition } : null,
      landings: Array.isArray(world.overworld.landings) ? world.overworld.landings.slice() : [],
      canDisembark: Boolean(world.overworld.canDisembark),
    } : null,
    actor: agent ? {
      id: agent.id,
      name: agent.name,
      profession: agent.profession,
      role: agent.role,
      position: { ...agent.position },
      onShip: Boolean(agent.onShip),
      biome,
      swimming: Boolean(agent.swimming),
      stamina: Math.round(agent.stamina ?? 0),
      health: Math.round(agent.health ?? 0),
      hunger: Math.round(agent.hunger ?? 0),
      morale: Number(agent.morale ?? 0),
    } : null,
    terrain: {
      biome,
      neighborhood,
      waterHere,
      blocked,
      localZone,
      nearestBiomes,
    },
    presence,
    nearbySites,
    resources: { ...(world?.resources || {}) },
    crew: agents.map((other) => ({
      id: other.id,
      name: other.name,
      profession: other.profession,
      role: other.role,
      alive: Boolean(other.alive),
      imprisoned: Boolean(other.imprisoned),
      distance: Number(distFn(focus, other.position).toFixed(2)),
      present: distFn(focus, other.position) <= 8,
      lastSeenTick: other.lastSeen?.tick ?? 0,
    })),
    route: Array.isArray(route) ? route.slice() : [],
  };
}

module.exports = {
  buildWorldSot,
  summarizePresence,
};
