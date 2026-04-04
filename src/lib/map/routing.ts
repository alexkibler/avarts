export function getDistance(coord1: {lat: number, lon: number}, coord2: {lat: number, lon: number}) {
  const R = 6371; // Radius of the earth in km
  const dLat = (coord2.lat - coord1.lat) * (Math.PI / 180);
  const dLon = (coord2.lon - coord1.lon) * (Math.PI / 180);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(coord1.lat * (Math.PI / 180)) * Math.cos(coord2.lat * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function getPermutations(arr: any[]) {
  if (arr.length <= 1) return [arr];
  const result: any[] = [];

  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = arr.slice(0, i).concat(arr.slice(i + 1));
    const remainingPerms = getPermutations(remaining) as any[];

    for (let j = 0; j < remainingPerms.length; j++) {
      result.push([current].concat(remainingPerms[j]));
    }
  }
  return result;
}

export function findOptimalRoute(startPoint: {lat: number, lon: number}, destinations: any[]) {
  const permutations = getPermutations(destinations);
  let shortestDistance = Infinity;
  let bestRoute: any[] = [];

  for (const route of permutations) {
    let currentDistance = 0;
    let currentLocation = startPoint;

    for (const stop of route) {
      currentDistance += getDistance(currentLocation, stop);
      currentLocation = stop;

      if (currentDistance >= shortestDistance) break;
    }

    if (currentDistance < shortestDistance) {
      shortestDistance = currentDistance;
      bestRoute = route;
    }
  }

  return {
    optimalOrder: [startPoint, ...bestRoute],
    totalDistanceKm: shortestDistance
  };
}
