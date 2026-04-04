import type { Route } from '$lib/types';

export function generateGPX(routeData: Route, sessionName: string, apSlot: string, user: any) {
  const userName = user?.name || "Player";
  const userId = user?.id || "";

  const combinedName = `${sessionName}_${apSlot}`;

  const gpx = `<?xml version='1.0' encoding='UTF-8'?>
<gpx version="1.1" creator="${userName}" xmlns="http://www.topografix.com/GPX/1/1" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${combinedName}</name>
    <author><name>${userName}</name><link href="${userId}" /></author>
    <copyright author="OpenStreetMap contributors"><license>https://www.openstreetmap.org/copyright</license></copyright>
  </metadata>
  <trk>
    <name>${combinedName}</name>
    <type>cycling</type>
    <trkseg>
      ${routeData.coordinates.map((coord: any) => `<trkpt lat="${coord.lat}" lon="${coord.lng}"><ele>${coord.meta?.elevation || 0}</ele></trkpt>`).join('\n      ')}
    </trkseg>
  </trk>
</gpx>`;
  return gpx;
}
