import { useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

type LatLng = { latitude: number; longitude: number };

export type LeafletMarker = LatLng & {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
  avatarUrl?: string | null;
};

export type LeafletMapHandle = {
  flyTo: (target: LatLng, zoom?: number) => void;
  zoomBy: (delta: number) => void;
};

export type LeafletMeetup = LatLng & { label: string };

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
  // The active trip's meetup point, drawn as a flag with a dashed line from you.
  meetup?: LeafletMeetup | null;
  // Changing this flies the map to that point (e.g. arriving from an SOS alert).
  focus?: LatLng | null;
  isDark: boolean;
  selectedId?: string | null;
  onMarkerPress?: (id: string) => void;
  onMeetupPress?: () => void;
  ref?: Ref<LeafletMapHandle>;
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
  .pin { display: flex; flex-direction: column; align-items: center; transition: transform 160ms ease-out; transform-origin: 50% 19px; }
  .pin.selected { transform: scale(1.18); }
  .pin-photo { width: 38px; height: 38px; border-radius: 50%; border: 3px solid; background: #CBD5E1 center/cover no-repeat;
    box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;
    font: 700 14px sans-serif; color: #FFFFFF; box-sizing: border-box; }
  .pin-label { margin-top: 3px; max-width: 90px; padding: 1px 6px; border-radius: 8px; font: 600 11px sans-serif;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: rgba(255,255,255,0.92); color: #17233F;
    box-shadow: 0 1px 3px rgba(0,0,0,0.2); }
  body.dark .pin-label { background: rgba(17,27,46,0.92); color: #FFFFFF; }
  .me { position: relative; width: 18px; height: 18px; }
  .me-dot { position: absolute; inset: 0; border-radius: 50%; background: #2F6BFF; border: 3px solid #FFFFFF; box-sizing: border-box; box-shadow: 0 1px 4px rgba(0,0,0,0.35); }
  .me-pulse { position: absolute; inset: 0; border-radius: 50%; background: rgba(47,107,255,0.45); animation: pulse 2s ease-out infinite; }
  @keyframes pulse { from { transform: scale(1); opacity: 0.9; } to { transform: scale(3.2); opacity: 0; } }
  .cluster { width: 44px; height: 44px; border-radius: 50%; background: #2246C7; border: 3px solid #FFFFFF; box-sizing: border-box;
    box-shadow: 0 0 0 5px rgba(34,70,199,0.25), 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;
    font: 800 14px sans-serif; color: #FFFFFF; }
  .meetup { display: flex; flex-direction: column; align-items: center; }
  .meetup-flag { width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: #F97316;
    border: 3px solid #FFFFFF; box-sizing: border-box; box-shadow: 0 2px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; }
  .meetup-flag span { transform: rotate(45deg); font: 800 13px sans-serif; color: #FFFFFF; }
  .meetup .pin-label { margin-top: 5px; }
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
  var baseLayer = L.layerGroup().addTo(map);
  var peopleLayer = L.layerGroup().addTo(map);
  var clusterLayer = L.layerGroup().addTo(map);
  function send(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
  function esc(text) { var d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }

  // One persistent marker per person, so position updates glide instead of jumping.
  var people = {};
  var selectedId = null;
  var animating = false;
  var GLIDE_MS = 900;
  var CLUSTER_PX = 46;

  function pinIcon(m, selected) {
    var initial = esc((m.title || '?').trim().charAt(0).toUpperCase());
    var photo = m.avatarUrl
      ? '<div class="pin-photo" style="border-color:' + esc(m.color) + ';background-image:url(&quot;' + esc(encodeURI(m.avatarUrl)) + '&quot;)"></div>'
      : '<div class="pin-photo" style="border-color:' + esc(m.color) + ';background-color:' + esc(m.color) + '">' + initial + '</div>';
    return L.divIcon({
      className: '',
      html: '<div class="pin' + (selected ? ' selected' : '') + '">' + photo + '<div class="pin-label">' + esc(m.title) + '</div></div>',
      iconSize: [90, 62], iconAnchor: [45, 19],
    });
  }

  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function step(now) {
    var busy = false;
    Object.keys(people).forEach(function (id) {
      var p = people[id];
      if (!p.anim) return;
      var t = Math.min(1, (now - p.anim.start) / GLIDE_MS);
      var k = ease(t);
      p.pos = [p.anim.from[0] + (p.to[0] - p.anim.from[0]) * k, p.anim.from[1] + (p.to[1] - p.anim.from[1]) * k];
      p.marker.setLatLng(p.pos);
      if (t >= 1) { p.anim = null; } else { busy = true; }
    });
    if (busy) { requestAnimationFrame(step); } else { animating = false; recluster(); }
  }

  // Greedy pixel-distance grouping; the selected person always keeps their own pin.
  function recluster() {
    clusterLayer.clearLayers();
    var ids = Object.keys(people);
    var used = {};
    var canCluster = map.getZoom() < map.getMaxZoom();
    ids.forEach(function (id) {
      if (used[id]) return;
      used[id] = true;
      var group = [id];
      if (canCluster && id !== selectedId) {
        var a = map.latLngToContainerPoint(people[id].to);
        ids.forEach(function (other) {
          if (used[other] || other === selectedId) return;
          if (a.distanceTo(map.latLngToContainerPoint(people[other].to)) < CLUSTER_PX) { used[other] = true; group.push(other); }
        });
      }
      if (group.length === 1) {
        if (!peopleLayer.hasLayer(people[id].marker)) peopleLayer.addLayer(people[id].marker);
        return;
      }
      var lat = 0, lng = 0;
      group.forEach(function (gid) {
        peopleLayer.removeLayer(people[gid].marker);
        lat += people[gid].to[0]; lng += people[gid].to[1];
      });
      var bounds = L.latLngBounds(group.map(function (gid) { return people[gid].to; }));
      L.marker([lat / group.length, lng / group.length], {
        icon: L.divIcon({ className: '', html: '<div class="cluster">+' + group.length + '</div>', iconSize: [44, 44], iconAnchor: [22, 22] }),
        zIndexOffset: 500,
      })
        .on('click', function () { map.flyToBounds(bounds, { padding: [70, 70], maxZoom: map.getMaxZoom(), duration: 0.6 }); })
        .addTo(clusterLayer);
    });
  }
  map.on('zoomend', recluster);

  window.updateMap = function (state) {
    document.body.classList.toggle('dark', !!state.dark);
    setStyle(state.style, !!state.dark);
    selectedId = state.selectedId;

    baseLayer.clearLayers();
    if (state.me) {
      if (state.radius) {
        L.circle([state.me.latitude, state.me.longitude], { radius: state.radius, color: 'rgba(34,70,199,0.35)', weight: 1, fillColor: '#2246C7', fillOpacity: 0.08, interactive: false }).addTo(baseLayer);
      }
      L.marker([state.me.latitude, state.me.longitude], {
        icon: L.divIcon({ className: '', html: '<div class="me"><div class="me-pulse"></div><div class="me-dot"></div></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false, zIndexOffset: -100,
      }).addTo(baseLayer);
    }
    if (state.meetup) {
      if (state.me) {
        L.polyline([[state.me.latitude, state.me.longitude], [state.meetup.latitude, state.meetup.longitude]], {
          color: '#F97316', weight: 3, opacity: 0.85, dashArray: '2 8', lineCap: 'round', interactive: false,
        }).addTo(baseLayer);
      }
      L.marker([state.meetup.latitude, state.meetup.longitude], {
        icon: L.divIcon({
          className: '',
          html: '<div class="meetup"><div class="meetup-flag"><span>M</span></div><div class="pin-label">' + esc(state.meetup.label) + '</div></div>',
          iconSize: [90, 62], iconAnchor: [45, 34],
        }),
        zIndexOffset: 400,
      })
        .on('click', function () { send({ type: 'meetup' }); })
        .addTo(baseLayer);
    }

    var seen = {};
    var now = performance.now();
    state.markers.forEach(function (m) {
      seen[m.id] = true;
      var target = [m.latitude, m.longitude];
      var p = people[m.id];
      if (!p) {
        p = people[m.id] = { marker: L.marker(target), pos: target, to: target, anim: null, key: null };
        p.marker.on('click', function () { send({ type: 'marker', id: m.id }); });
      }
      var selected = m.id === state.selectedId;
      var key = [m.title, m.color, m.avatarUrl || '', selected].join('|');
      if (p.key !== key) {
        p.marker.setIcon(pinIcon(m, selected));
        p.marker.setZIndexOffset(selected ? 1000 : 0);
        p.key = key;
      }
      if (p.to[0] !== target[0] || p.to[1] !== target[1]) {
        p.anim = { from: p.pos, start: now };
        p.to = target;
      }
    });
    Object.keys(people).forEach(function (id) {
      if (!seen[id]) { peopleLayer.removeLayer(people[id].marker); delete people[id]; }
    });
    recluster();
    if (!animating && Object.keys(people).some(function (id) { return people[id].anim; })) {
      animating = true;
      requestAnimationFrame(step);
    }
  };
  map.on('moveend', function () {
    var c = map.getCenter();
    send({ type: 'view', latitude: c.lat, longitude: c.lng, zoom: map.getZoom() });
  });
  window.flyTo = function (lat, lng, zoom) { map.flyTo([lat, lng], zoom || Math.max(map.getZoom(), 15), { duration: 0.6 }); };
  window.zoomBy = function (delta) { map.setZoom(map.getZoom() + delta); };
  send({ type: 'ready' });
</script>
</body></html>`;
}

// Android map drawn with Leaflet + OpenStreetMap tiles in a WebView, so it doesn't
// depend on the Google Maps SDK or an API key (which rendered black for us).
export default function LeafletMap({ mapStyle, initialCenter, myPosition, radiusM, markers, meetup, focus, isDark, selectedId, onMarkerPress, onMeetupPress, ref }: LeafletMapProps) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  // Built once per mount: the parent remounts with a new key to change style; other changes are injected.
  const [html] = useState(() => buildHtml(initialCenter, isDark, mapStyle));

  const state = useMemo(
    () => ({ style: mapStyle, dark: isDark, me: myPosition, radius: radiusM ?? 0, markers, meetup: meetup ?? null, selectedId: selectedId ?? null }),
    [mapStyle, isDark, myPosition, radiusM, markers, meetup, selectedId]
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

  useImperativeHandle(ref, () => ({
    flyTo: (target, zoom) => {
      webViewRef.current?.injectJavaScript(`window.flyTo && window.flyTo(${target.latitude}, ${target.longitude}, ${zoom ?? 0}); true;`);
    },
    zoomBy: (delta) => {
      webViewRef.current?.injectJavaScript(`window.zoomBy && window.zoomBy(${delta}); true;`);
    },
  }));

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
    } else if (message.type === 'meetup') {
      onMeetupPress?.();
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
