<script lang="ts">
	import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
	import 'leaflet/dist/leaflet.css';
	import '@raruto/leaflet-elevation/dist/leaflet-elevation.css';
	import { env } from '$env/dynamic/public';
	import {
		mapNodes,
		activeWaypointIds,
		currentRoute,
		routeDistance,
		elevationGain,
		userLocation
	} from '$lib/mapState';
	import type { Coordinates, ElevationResponse, Route } from '$lib/types';
	import { getElevationData } from '$lib/routing';

	export let centerLat: number;
	export let centerLon: number;
	export let radius: number;
	export let sessionId: string;

	const dispatch = createEventDispatcher<{
		validated: void;
	}>();

	let mapElement: HTMLElement;
	let map: any;
	let L: any;
	const markerMap = new Map<string, any>();
	let routingControl: any = null;
	let elevationControl: any = null;
	let myLocationMarker: any = null;
	let rideLayer: any = null;
	let locating = false;

	// ── Marker Options ──────────────────────────────────────────────────────────

	function markerOptions(state: string, selected: boolean) {
		if (state === 'Checked') {
			return {
				radius: 8,
				fillColor: '#4ade80',
				color: selected ? '#fff' : '#22c55e',
				weight: selected ? 3 : 2,
				opacity: 1,
				fillOpacity: 0.85
			};
		} else if (state === 'Available') {
			return {
				radius: 8,
				fillColor: '#f97316',
				color: selected ? '#fff' : '#ea580c',
				weight: selected ? 3 : 2,
				opacity: 1,
				fillOpacity: 0.85
			};
		} else {
			return {
				radius: 4,
				fillColor: '#6b7280',
				color: '#4b5563',
				weight: 1,
				opacity: 0.45,
				fillOpacity: 0.35
			};
		}
	}

	// ── Internal Logic ──────────────────────────────────────────────────────────

	function renderPins() {
		if (!map || !L) return;
		for (const [, m] of markerMap) m.remove();
		markerMap.clear();

		for (const node of $mapNodes) {
			const marker = L.circleMarker([node.lat, node.lon], markerOptions(node.state, false));

			if (node.state !== 'Hidden') {
				marker.on('click', (e: any) => {
					L.DomEvent.stopPropagation(e);
					addNodeAsWaypoint(node, marker);
				});
				marker.bindTooltip(
					`<strong>Check #${node.ap_location_id}</strong><br/>${
						node.state === 'Checked' ? '✓ Checked' : 'Available — tap to route here'
					}`,
					{ direction: 'top', offset: [0, -6] }
				);
			}

			marker.addTo(map);
			markerMap.set(node.id, marker);
		}
	}

	function addNodeAsWaypoint(node: any, marker: any) {
		if (!routingControl) return;
		const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
		wps.push(L.Routing.waypoint(L.latLng(node.lat, node.lon), `Check #${node.ap_location_id}`));
		routingControl.setWaypoints(wps);
		marker.setStyle(markerOptions(node.state, true));
	}

	export function clearRoute() {
		routingControl?.setWaypoints([]);
		elevationControl?.clear();
		currentRoute.set(null);
		routeDistance.set(0);
		elevationGain.set(0);
		activeWaypointIds.set(new Set());
		for (const node of $mapNodes) {
			const marker = markerMap.get(node.id);
			if (marker) marker.setStyle(markerOptions(node.state, false));
		}
	}

	export function setWaypoints(wps: any[]) {
		routingControl?.setWaypoints(wps);
	}

	export function updateMarkerStyles(optimalOrder: any[]) {
		optimalOrder.slice(1).forEach((node) => {
			const marker = markerMap.get(node.id);
			if (marker) {
				marker.setStyle(markerOptions(node.state, true));
			}
		});
	}

	export function handleRideParsed(path: { lat: number; lon: number }[]) {
		clearRideLayer();
		if (!map || !L) return;

		const latLngs = path.map((p) => [p.lat, p.lon]);
		rideLayer = L.polyline(latLngs, {
			color: '#f97316', // orange-500
			weight: 4,
			opacity: 0.8,
			dashArray: '5, 10'
		}).addTo(map);

		const bounds = L.latLngBounds(latLngs);
		map.fitBounds(bounds, { padding: [50, 50] });
	}

	export function handleRideCancelled() {
		clearRideLayer();
	}

	function clearRideLayer() {
		if (rideLayer) {
			rideLayer.remove();
			rideLayer = null;
		}
	}

	function handleMyLocation(
		options: {
			silent?: boolean;
			callback?: (coords?: { lat: number; lon: number }) => void;
		} = {}
	) {
		const { silent = false, callback } = options;

		if (!navigator.geolocation) {
			if (!silent) alert('Geolocation is not supported by your browser.');
			callback?.();
			return;
		}

		navigator.geolocation.getCurrentPosition(
			(pos) => {
				const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
				userLocation.set(coords);

				if (map && L) {
					if (!silent) map.setView([coords.lat, coords.lon], 16);

					if (myLocationMarker) myLocationMarker.remove();
					myLocationMarker = L.circleMarker([coords.lat, coords.lon], {
						radius: 10,
						fillColor: '#3498db',
						color: '#fff',
						weight: 3,
						opacity: 1,
						fillOpacity: 0.9
					})
						.addTo(map)
						.bindTooltip('You are here', { permanent: false, direction: 'top' });
				}
				callback?.(coords);
			},
			(err) => {
				if (!silent) {
					const msg = 'Location request timed out. Using map center as fallback.';
					console.error('Geolocation error:', err);
					alert(msg);
				}
				callback?.();
			},
			{ enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
		);
	}

	export function triggerMyLocation(cb?: any) {
		handleMyLocation({ callback: cb });
	}

	// ── Reactivity ──────────────────────────────────────────────────────────────

	$: if ($mapNodes && map && L) {
		renderPins();
	}

	$: if ($activeWaypointIds && markerMap.size > 0) {
		// Sync markers with active waypoint IDs
		for (const [id, marker] of markerMap) {
			const node = $mapNodes.find((n) => n.id === id);
			if (node) {
				marker.setStyle(markerOptions(node.state, $activeWaypointIds.has(id)));
			}
		}
	}

	// ── Lifecycle ───────────────────────────────────────────────────────────────

	onMount(async () => {
		const leafletMod = await import('leaflet');
		L = leafletMod.default ?? leafletMod;
		window.L = L;
		await import('@raruto/leaflet-elevation');
		await import('leaflet-routing-machine');
		await import('leaflet-control-geocoder');
		await import('lrm-graphhopper');

		map = L.map(mapElement, { zoomControl: false }).setView([centerLat, centerLon], 13);

		// Custom "My Location" control
		const MyLocationControl = (L as any).Control.extend({
			onAdd: function () {
				const btn = L.DomUtil.create('button', 'ap-location-control');
				btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="22" y1="12" x2="18" y2="12"/><line x1="6" y1="12" x2="2" y2="12"/><line x1="12" y1="6" x2="12" y2="2"/><line x1="12" y1="22" x2="12" y2="18"/></svg>`;
				btn.title = 'My Location';
				btn.onclick = (e: any) => {
					L.DomEvent.stopPropagation(e);
					btn.classList.add('locating');
					handleMyLocation({ callback: () => btn.classList.remove('locating') });
				};
				return btn;
			}
		});
		new MyLocationControl({ position: 'bottomleft' }).addTo(map);
		L.control.zoom({ position: 'bottomleft' }).addTo(map);

		map.on('click', (e: any) => {
			if (!routingControl) return;
			const wps = routingControl.getWaypoints().filter((w: any) => w.latLng);
			wps.push(L.Routing.waypoint(e.latlng));
			routingControl.setWaypoints(wps);
		});

		L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
			maxZoom: 19,
			attribution:
				'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
		}).addTo(map);

		const circle = L.circle([centerLat, centerLon], {
			radius,
			color: '#f97316',
			fillColor: '#f97316',
			fillOpacity: 0.04,
			weight: 1.5,
			dashArray: '6 4'
		}).addTo(map);

		map.fitBounds(circle.getBounds(), { padding: [24, 24] });

		const isPlayout = typeof window !== 'undefined' && (window as any).PLAYWRIGHT_TEST;
		const effectiveUrl =
			env.PUBLIC_GRAPHHOPPER_URL ||
			(isPlayout ? 'https://routing.alexkibler.com/route' : '/api/route');

		const ghRouter = (L.Routing as any).graphHopper(undefined, {
			serviceUrl: effectiveUrl,
			urlParameters: { profile: 'bike' }
		});

		routingControl = (L.Routing as any)
			.control({
				router: ghRouter,
				routeWhileDragging: true,
				show: false,
				addWaypoints: true,
				waypoints: []
			})
			.addTo(map);

		elevationControl = (L as any).control.elevation({
			srcFolder: 'https://unpkg.com/@raruto/leaflet-elevation/src/',
			detached: true,
			elevationDiv: '#elevation-container',
			followMarker: false,
			theme: 'orange-theme'
		});
		elevationControl.addTo(map);

		routingControl.on('routesfound', async (e: any) => {
			const r = e.routes[0];
			currentRoute.set(r);
			routeDistance.set(r.summary.totalDistance);

			const elevations = await getElevationData(r.coordinates);
			const coordsWithEle = r.coordinates.map((c: any, i: number) => [
				c.lat,
				c.lng,
				elevations[i] || 0
			]);
			elevationControl.clear();
			elevationControl.addData(L.polyline(coordsWithEle));

			const gain = elevations.reduce((acc: number, cur: number, i: number) => {
				if (i === 0) return 0;
				const diff = cur - elevations[i - 1];
				return acc + (diff > 0 ? diff : 0);
			}, 0);
			elevationGain.set(gain);

			const newActive = new Set<string>();
			routingControl.getWaypoints().forEach((wp: any) => {
				if (!wp.latLng) return;
				const matchedNode = $mapNodes.find(
					(n) =>
						Math.abs(n.lat - wp.latLng.lat) < 0.0001 && Math.abs(n.lon - wp.latLng.lng) < 0.0001
				);
				if (matchedNode) newActive.add(matchedNode.id);
			});
			activeWaypointIds.set(newActive);
		});

		// Fetch user location into state on load
		handleMyLocation({ silent: true });
	});

	onDestroy(() => {
		map?.remove();
	});
</script>

<div class="map-container" bind:this={mapElement}></div>

<style>
	.map-container {
		position: absolute;
		inset: 0;
		background: #1a241a;
		overflow: hidden;
	}
	:global(.leaflet-tile) {
		border-style: none !important;
	}
</style>
