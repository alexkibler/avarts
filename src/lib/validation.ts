import FitParser from 'fit-file-parser';
import { pb } from '$lib/pb';
import { sendLocationChecks } from '$lib/ap';

// Haversine formula to calculate distance between two coordinates in meters
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;

  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export async function validateFitFile(file: File, sessionId: string): Promise<string[]> {
  const messages: string[] = [];

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      if (!e.target?.result) {
        reject('Failed to read file.');
        return;
      }

      const fitParser = new FitParser({
        force: true,
        speedUnit: 'km/h',
        lengthUnit: 'km',
        temperatureUnit: 'celcius',
        elapsedRecordField: true,
        mode: 'cascade',
      });

      fitParser.parse(e.target.result, async (error: any, data: any) => {
        if (error) {
          reject('Failed to parse FIT file.');
          return;
        }

        try {
          // Extract records (GPS points)
          let records: any[] = [];
          if (data.activity && data.activity.sessions) {
            data.activity.sessions.forEach((session: any) => {
              if (session.laps) {
                session.laps.forEach((lap: any) => {
                  if (lap.records) {
                    records = records.concat(lap.records);
                  }
                });
              }
            });
          }

          if (records.length === 0) {
            resolve(['No GPS data found in FIT file.']);
            return;
          }

          // Filter out points with no position
          const path = records.filter(r => r.position_lat && r.position_long).map(r => ({
            lat: r.position_lat,
            lon: r.position_long
          }));

          // Fetch all available nodes for this session
          const availableNodes = await pb.collection('map_nodes').getFullList({
            filter: `session = "${sessionId}" && state = "Available"`,
          });

          if (availableNodes.length === 0) {
            resolve(['No available nodes to check.']);
            return;
          }

          const newlyCheckedNodeIds: string[] = [];
          const apLocationIdsToCheck: number[] = [];

          // For each available node, check if any point in the path is within 30 meters
          for (const node of availableNodes) {
            const isWithinRadius = path.some(point => {
              const distance = getDistance(node.lat, node.lon, point.lat, point.lon);
              return distance <= 30; // 30 meters threshold
            });

            if (isWithinRadius) {
              newlyCheckedNodeIds.push(node.id);
              apLocationIdsToCheck.push(node.ap_location_id);
              messages.push(`Unlocked Location ${node.ap_location_id} at [${node.lat}, ${node.lon}]!`);
            }
          }

          // Update PocketBase and send Archipelago checks
          if (newlyCheckedNodeIds.length > 0) {
            // Update DB
            const updatePromises = newlyCheckedNodeIds.map(id =>
              pb.collection('map_nodes').update(id, { state: 'Checked' })
            );
            await Promise.all(updatePromises);

            // Send AP check
            sendLocationChecks(apLocationIdsToCheck);
            messages.push(`Successfully validated ${newlyCheckedNodeIds.length} location(s) and notified Archipelago.`);
          } else {
            messages.push('No available locations were reached in this ride.');
          }

          resolve(messages);

        } catch (dbErr) {
          console.error("Validation error:", dbErr);
          reject("An error occurred during database operations.");
        }
      });
    };

    reader.onerror = () => {
      reject('File reader error.');
    };

    reader.readAsArrayBuffer(file);
  });
}
