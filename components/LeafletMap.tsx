import { useEffect, useMemo, useRef, useState } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type LatLng = { latitude: number; longitude: number };

export type LeafletMarker = LatLng & {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
};

export type MapStyle = 'plain' | 'streets' | 'satellite' | 'terrain';

export const MAP_STYLE_ATTRIBUTION: Record<MapStyle, string> = {
  plain: 'Map © Esri, HERE, Garmin, © OpenStreetMap contributors',
  streets: '© OpenStreetMap contributors',
  satellite: 'Imagery © Esri, Maxar, Earthstar Geographics',
  terrain: '© OpenStreetMap contributors, SRTM · © OpenTopoMap',
};

type LeafletMapProps = {
  mapStyle: MapStyle;
  initialCenter: LatLng;
  myPosition: LatLng | null;
  radiusM?: number;
  markers: LeafletMarker[];
  // Changing this flies the map to that point (e.g. arriving from an SOS alert).
  focus?: LatLng | null;
  isDark: boolean;
  onMarkerPress?: (id: string) => void;
};

// All keyless tile sources (CARTO's basemaps now watermark keyless apps).
// Dark mode inverts the street tiles with a CSS filter; imagery and terrain stay as-is.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const TILE_LAYERS = {
  // Minimal grey canvas, closest to the old CARTO look; has its own dark variant.
  plain: [
    { url: `${ESRI}/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16 },
    { url: `${ESRI}/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16 },
  ],
  plainDark: [
    { url: `${ESRI}/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16 },
    { url: `${ESRI}/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}`, maxZoom: 16 },
  ],
  streets: [{ url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', maxZoom: 19 }],
  // Satellite photos with a place-name overlay on top.
  satellite: [
    { url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, maxZoom: 19 },
    { url: `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, maxZoom: 19 },
  ],
  terrain: [{ url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', maxZoom: 17 }],
} satisfies Record<MapStyle | 'plainDark', { url: string; maxZoom: number }[]>;

// Where the user last left the map, so switching styles (which reloads the page) keeps the view.
let lastView: { latitude: number; longitude: number; zoom: number } | null = null;

function buildHtml(center: LatLng, isDark: boolean, mapStyle: MapStyle) {
  const view = lastView ?? { ...center, zoom: 13 };
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${isDark ? '#111B2E' : '#EAF0F5'}; }
  .leaflet-popup-content { margin: 8px 12px; font: 13px/1.4 sans-serif; }
  body.dark.streets .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
</style>
</head><body class="${isDark ? 'dark' : ''} ${mapStyle}">
<div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${view.latitude}, ${view.longitude}], ${view.zoom});
  var TILE_LAYERS = ${JSON.stringify(TILE_LAYERS)};
  var currentStyle = null;
  var currentKey = null;
  var tileLayers = [];
  // A style may have a "<style>Dark" tile set used in dark mode.
  function setStyle(style, dark) {
    if (!TILE_LAYERS[style]) return;
    var key = dark && TILE_LAYERS[style + 'Dark'] ? style + 'Dark' : style;
    if (currentStyle) document.body.classList.remove(currentStyle);
    document.body.classList.add(style);
    currentStyle = style;
    if (key === currentKey) return;
    tileLayers.forEach(function (t) { map.removeLayer(t); });
    tileLayers = TILE_LAYERS[key].map(function (t) { return L.tileLayer(t.url, { maxZoom: 19, maxNativeZoom: t.maxZoom, subdomains: 'abc' }).addTo(map); });
    currentKey = key;
  }
  setStyle(${JSON.stringify(mapStyle)}, ${isDark});
  var layer = L.layerGroup().addTo(map);
  function send(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
  function esc(text) { var d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }
  window.updateMap = function (state) {
    document.body.classList.toggle('dark', !!state.dark);
    setStyle(state.style, !!state.dark);
    layer.clearLayers();
    if (state.me) {
      if (state.radius) {
        L.circle([state.me.latitude, state.me.longitude], { radius: state.radius, color: 'rgba(34,70,199,0.35)', weight: 1, fillColor: '#2246C7', fillOpacity: 0.08, interactive: false }).addTo(layer);
      }
      L.circleMarker([state.me.latitude, state.me.longitude], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#2F6BFF', fillOpacity: 1 }).addTo(layer);
    }
    state.markers.forEach(function (m) {
      L.circleMarker([m.latitude, m.longitude], { radius: 9, color: '#FFFFFF', weight: 2, fillColor: m.color, fillOpacity: 1 })
        .bindPopup('<b>' + esc(m.title) + '</b>' + (m.subtitle ? '<br/>' + esc(m.subtitle) : ''))
        .on('click', function () { send({ type: 'marker', id: m.id }); })
        .addTo(layer);
    });
  };
  map.on('moveend', function () {
    var c = map.getCenter();
    send({ type: 'view', latitude: c.lat, longitude: c.lng, zoom: map.getZoom() });
  });
  window.flyTo = function (lat, lng) { map.flyTo([lat, lng], 16, { duration: 0.6 }); };
  send({ type: 'ready' });
</script>
</body></html>`;
}

// Android map drawn with Leaflet + OpenStreetMap tiles in a WebView, so it doesn't
// depend on the Google Maps SDK or an API key (which rendered black for us).
export default function LeafletMap({ mapStyle, initialCenter, myPosition, radiusM, markers, focus, isDark, onMarkerPress }: LeafletMapProps) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  // Built once per mount: the parent remounts with a new key to change style; other changes are injected.
  const [html] = useState(() => buildHtml(initialCenter, isDark, mapStyle));

  const state = useMemo(
    () => ({ style: mapStyle, dark: isDark, me: myPosition, radius: radiusM ?? 0, markers }),
    [mapStyle, isDark, myPosition, radiusM, markers]
  );
  const stateRef = useRef(state);

  function pushState() {
    webViewRef.current?.injectJavaScript(`window.updateMap && window.updateMap(${JSON.stringify(stateRef.current)}); true;`);
  }

  useEffect(() => {
    stateRef.current = state;
    if (readyRef.current) {
      pushState();
    }
  }, [state]);

  const focusLat = focus?.latitude;
  const focusLng = focus?.longitude;
  const focusRef = useRef<LatLng | null>(null);

  function pushFocus() {
    const target = focusRef.current;
    if (target) {
      webViewRef.current?.injectJavaScript(`window.flyTo && window.flyTo(${target.latitude}, ${target.longitude}); true;`);
    }
  }

  useEffect(() => {
    focusRef.current = focusLat !== undefined && focusLng !== undefined ? { latitude: focusLat, longitude: focusLng } : null;
    if (readyRef.current) {
      pushFocus();
    }
  }, [focusLat, focusLng]);

  function handleMessage(event: WebViewMessageEvent) {
    let message: { type?: string; id?: string; latitude?: number; longitude?: number; zoom?: number };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'ready') {
      readyRef.current = true;
      pushState();
      pushFocus();
    } else if (message.type === 'view' && message.latitude !== undefined && message.longitude !== undefined && message.zoom !== undefined) {
      lastView = { latitude: message.latitude, longitude: message.longitude, zoom: message.zoom };
    } else if (message.type === 'marker' && message.id) {
      onMarkerPress?.(message.id);
    }
  }

  return (
    <WebView
      ref={webViewRef}
      originWhitelist={['*']}
      source={{ html, baseUrl: 'https://partyup.local/' }}
      onMessage={handleMessage}
      style={{ flex: 1, backgroundColor: isDark ? '#111B2E' : '#EAF0F5' }}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      overScrollMode="never"
      nestedScrollEnabled
      setBuiltInZoomControls={false}
    />
  );
}
