"use client";

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapStore } from '@/lib/store';
import { getElevationData } from '@/lib/routing';
import type { Route } from '@/lib/types';
import 'leaflet-routing-machine';

// We import graphhopper lrm plugin dynamically if needed, or ensure it's available
if (typeof window !== 'undefined') {
  require('lrm-graphhopper');
}

interface Props {
  centerLat: number;
  centerLon: number;
  radius: number;
  sessionId: string;
}

export default function MapCore({ centerLat, centerLon, radius, sessionId }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<L.Map | null>(null);

  const mapNodes = useMapStore((state) => state.mapNodes);
  const activeWaypointIds = useMapStore((state) => state.activeWaypointIds);
  const currentRoute = useMapStore((state) => state.currentRoute);

  const setCurrentRoute = useMapStore((state) => state.setCurrentRoute);
  const setRouteDistance = useMapStore((state) => state.setRouteDistance);
  const setElevationGain = useMapStore((state) => state.setElevationGain);

  const markerMapRef = useRef(new Map<string, L.CircleMarker>());
  const routingControlRef = useRef<any>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // Avoid re-initialization
    if (map) return;

    const newMap = L.map(mapRef.current, {
      zoomControl: false,
      attributionControl: false
    }).setView([centerLat, centerLon], 13);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
    }).addTo(newMap);

    L.circle([centerLat, centerLon], {
      color: '#4b5563',
      fillColor: '#4b5563',
      fillOpacity: 0.1,
      radius: radius
    }).addTo(newMap);

    // Initial marker render
    updateMarkers(newMap, mapNodes);
    setMap(newMap);

    return () => {
      newMap.remove();
      setMap(null);
    };
  }, []);

  // Update markers when mapNodes change
  useEffect(() => {
    if (!map) return;
    updateMarkers(map, mapNodes);
  }, [mapNodes, map, activeWaypointIds]);

  const updateMarkers = (mapInstance: L.Map, nodes: any[]) => {
    const currentMarkerMap = markerMapRef.current;

    nodes.forEach(node => {
      let marker = currentMarkerMap.get(node.id);

      const isTargeted = activeWaypointIds.has(node.id);
      let color = '#4b5563'; // Hidden
      if (node.state === 'Available') color = '#2ecc71';
      else if (node.state === 'Checked') color = '#3b82f6';

      if (isTargeted) color = '#e67e22'; // Target Orange

      if (!marker) {
        marker = L.circleMarker([node.lat, node.lon], {
          radius: isTargeted ? 8 : 6,
          color: color,
          fillColor: color,
          fillOpacity: isTargeted ? 0.9 : 0.7,
          weight: isTargeted ? 3 : 2
        });

        marker.on('click', () => {
          // In a real app we would dispatch to the parent here, or handle via store
          const newIds = new Set(useMapStore.getState().activeWaypointIds);
          if (newIds.has(node.id)) {
            newIds.delete(node.id);
          } else {
            if (node.state !== 'Checked') newIds.add(node.id);
          }
          useMapStore.getState().setActiveWaypointIds(newIds);
        });

        marker.addTo(mapInstance);
        currentMarkerMap.set(node.id, marker);
      } else {
        marker.setStyle({
          color: color,
          fillColor: color,
          radius: isTargeted ? 8 : 6,
          fillOpacity: isTargeted ? 0.9 : 0.7,
          weight: isTargeted ? 3 : 2
        });
      }
    });
  };

  // Handle routing updates
  useEffect(() => {
    if (!map) return;

    if (!currentRoute) {
      if (routingControlRef.current) {
        map.removeControl(routingControlRef.current);
        routingControlRef.current = null;
      }
      return;
    }

    const route = currentRoute;
    if (routingControlRef.current) {
      map.removeControl(routingControlRef.current);
    }

    const graphhopperUrl = process.env.NEXT_PUBLIC_GRAPHHOPPER_URL || 'http://localhost:8989/route';

    // Create new routing control
    routingControlRef.current = L.Routing.control({
      waypoints: route.path.map(p => L.latLng(p.lat, p.lon)),
      router: (L.Routing as any).graphHopper(null, {
        serviceUrl: graphhopperUrl,
        urlParameters: { vehicle: 'bike' }
      }),
      addWaypoints: false,
      draggableWaypoints: false,
      fitSelectedRoutes: true,
      show: false,
      lineOptions: {
        styles: [{ color: '#e67e22', opacity: 0.8, weight: 5 }],
        extendToWaypoints: true,
        missingRouteTolerance: 10
      }
    }).addTo(map);

    routingControlRef.current.on('routesfound', async function(e: any) {
      const foundRoute = e.routes[0];
      setRouteDistance(foundRoute.summary.totalDistance);

      const pathCoords = foundRoute.coordinates.map((c: any) => ({ lat: c.lat, lon: c.lng }));

      try {
        const elevationData = await getElevationData(pathCoords);
        if (elevationData && elevationData.elevations) {
          let gain = 0;
          for (let i = 1; i < elevationData.elevations.length; i++) {
            const diff = elevationData.elevations[i] - elevationData.elevations[i-1];
            if (diff > 0) gain += diff;
          }
          setElevationGain(gain);
        }
      } catch (err) {
        console.warn("Failed to get elevation data", err);
      }
    });

  }, [currentRoute, map]);

  return <div ref={mapRef} className="w-full h-full" />;
}
