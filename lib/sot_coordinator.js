const { buildWorldSot: buildWorldSotCore } = require('./world_sot');
const { buildShipSceneState, stepShipSystems } = require('./ship_interior');

function buildCoordinatedSot({ world, agents = [], agent = null, position = null, route = [], expeditionSites = [], biomeAtPoint, biomeCountsAround, zoneLabelForPosition, tileBlocked, distFn, routeDistance = 10 }) {
  const shipScene = stepShipSystems(world, agents);
  const sot = buildWorldSotCore({
    world,
    agents,
    agent,
    position,
    route,
    expeditionSites,
    biomeAtPoint,
    biomeCountsAround,
    zoneLabelForPosition,
    tileBlocked,
    distFn,
    routeDistance,
  });
  const shipSceneSummary = buildShipSceneState(world, agents, agent);
  return {
    ...sot,
    ship: {
      ...sot.ship,
      scene: {
        ...shipSceneSummary,
        ...shipScene,
      },
      compartments: shipSceneSummary.compartments,
      graph: shipSceneSummary.graph,
      occupancy: shipSceneSummary.occupancy,
      exitReady: shipSceneSummary.exitReady,
    },
  };
}

module.exports = {
  buildCoordinatedSot,
};
