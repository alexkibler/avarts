import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet-routing-machine';
import { getGraphhopperUrl } from '../../../lib/graphhopper';

// Mock map node interface to map existing Svelte properties to React port logic.
interface MapNode {
    id: string;
    lat: number;
    lon: number;
    state: string;
    ap_location_id: string;
}

interface MapCoreProps {
    centerLat: number;
    centerLon: number;
    radius: number;
    sessionId: string;
    nodes?: MapNode[];
}

const MapCoreInner: React.FC<MapCoreProps> = ({ centerLat, centerLon, radius, sessionId, nodes = [] }) => {
    const map = useMap();
    const routingControlRef = useRef<any>(null);

    useEffect(() => {
        // Initialize routing control with GraphHopper proxy dynamically
        const url = getGraphhopperUrl();

        // This relies on the lrm-graphhopper plugin
        if ((L.Routing as any).graphHopper) {
            const ghRouter = (L.Routing as any).graphHopper(undefined, {
                serviceUrl: url,
                urlParameters: { profile: 'bike' }
            });

            const routingControl = (L.Routing as any).control({
                router: ghRouter,
                routeWhileDragging: true,
                show: false,
                addWaypoints: true,
                waypoints: []
            }).addTo(map);

            routingControlRef.current = routingControl;

            return () => {
                if (routingControlRef.current) {
                    map.removeControl(routingControlRef.current);
                }
            }
        }
    }, [map]);

    return null; // Logic-only component hooking into map context
};

export default MapCoreInner;
