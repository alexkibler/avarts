<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import L from 'leaflet';
  import 'leaflet/dist/leaflet.css';
  import { checksStore } from '$lib/stores';
  import type { ApConnectionOptions } from '$lib/ap';

  export let view: L.LatLngExpression;
  export let radius: number;

  let mapElement: HTMLElement;
  let map: L.Map | undefined;
  let markersLayer = new L.FeatureGroup();

  onMount(() => {
    map = L.map(mapElement);

    // Calculate bounds based on center and radius (in meters)
    const centerLatLng = L.latLng(view as L.LatLngTuple);
    const circle = L.circle(centerLatLng, { radius });
    map.fitBounds(circle.getBounds());

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    markersLayer.addTo(map);
  });

  onDestroy(() => {
    if (map) {
      map.remove();
      map = undefined;
    }
  });

  $: if (map && $checksStore) {
    markersLayer.clearLayers();

    $checksStore.forEach((node) => {
      let color = 'gray';
      let r = 4;
      let opacity = 0.5;

      if (node.state === 'Available') {
        color = 'orange';
        r = 8;
        opacity = 1.0;
      } else if (node.state === 'Checked') {
        color = 'green';
        r = 6;
        opacity = 0.8;
      }

      const marker = L.circleMarker([node.lat, node.lon], {
        color,
        fillColor: color,
        fillOpacity: opacity,
        radius: r,
      });

      marker.bindPopup(`<b>Intersection ${node.ap_location_id}</b><br/>State: ${node.state}`);
      markersLayer.addLayer(marker);
    });
  }
</script>

<div class="w-full h-full" bind:this={mapElement}></div>

<style>
  .w-full { width: 100%; }
  .h-full { height: 100%; }
</style>
