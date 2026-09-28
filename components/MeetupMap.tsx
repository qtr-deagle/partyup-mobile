import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

export type LatLng = { latitude: number; longitude: number };

export type MeetupMapPerson = LatLng & {
  id: string;
  name: string;
  color: string;
  subtitle?: string;
};

type MeetupMapProps = {
  initialCenter: LatLng;
  initialZoom?: number;
  // The fixed meetup pin (view mode). In pick mode the pin is the screen center instead.
  meetup?: LatLng | null;
  meetupLabel?: string;
  people?: MeetupMapPerson[];
  me?: LatLng | null;
  // Changing this flies the map there (e.g. a municipality was picked).
  focus?: (LatLng & { zoom?: number }) | null;
  // Pick mode: the map pans under a fixed center pin and reports where it lands.
  pickMode?: boolean;
  onCenterChange?: (center: LatLng) => void;
  // View mode: zoom to show the meetup pin and everyone on first load.
  fitToContent?: boolean;
  isDark: boolean;
};

const PIN_COLOR = '#E32727';

function buildHtml(center: LatLng, zoom: number, isDark: boolean) {
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css" />
<style>
  html, body, #map { margin: 0; padding: 0; height: 100%; width: 100%; background: ${isDark ? '#111B2E' : '#EAF0F5'}; }
  body.dark .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
  .leaflet-popup-content { margin: 8px 12px; font: 13px/1.4 sans-serif; }
  .person { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 15px;
    border: 2px solid #fff; color: #fff; font: bold 12px sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .pin { position: relative; box-sizing: border-box; width: 30px; height: 30px; border-radius: 15px 15px 15px 0; transform: rotate(-45deg); background: ${PIN_COLOR};
    border: 2px solid #fff; box-shadow: 0 1px 4px rgba(0,0,0,.35); }
  .pin::after { content: ''; position: absolute; left: 8px; top: 8px; width: 10px; height: 10px; border-radius: 5px; background: #fff; }
</style>
</head><body class="${isDark ? 'dark' : ''}">
<div id="map"></div>
<script src="https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${center.latitude}, ${center.longitude}], ${zoom});
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
  var layer = L.layerGroup().addTo(map);
  var fitted = false;
  function send(message) { window.ReactNativeWebView.postMessage(JSON.stringify(message)); }
  function esc(text) { var d = document.createElement('div'); d.textContent = text || ''; return d.innerHTML; }
  function initials(name) {
    return (name || '?').split(/\\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase();
  }
  window.updateMap = function (state) {
    document.body.classList.toggle('dark', !!state.dark);
    layer.clearLayers();
    var points = [];
    if (state.meetup) {
      var pin = L.divIcon({ className: '', html: '<div class="pin"></div>', iconSize: [30, 30], iconAnchor: [15, 36], popupAnchor: [0, -34] });
      L.marker([state.meetup.latitude, state.meetup.longitude], { icon: pin })
        .bindPopup('<b>Meetup point</b>' + (state.meetupLabel ? '<br/>' + esc(state.meetupLabel) : ''))
        .addTo(layer);
      points.push([state.meetup.latitude, state.meetup.longitude]);
    }
    if (state.me) {
      L.circleMarker([state.me.latitude, state.me.longitude], { radius: 7, color: '#FFFFFF', weight: 2, fillColor: '#2F6BFF', fillOpacity: 1 })
        .bindPopup('<b>You</b>').addTo(layer);
      points.push([state.me.latitude, state.me.longitude]);
    }
    (state.people || []).forEach(function (p) {
      var icon = L.divIcon({ className: '', html: '<div class="person" style="background:' + p.color + '">' + esc(initials(p.name)) + '</div>', iconSize: [30, 30], iconAnchor: [15, 15] });
      L.marker([p.latitude, p.longitude], { icon: icon })
        .bindPopup('<b>' + esc(p.name) + '</b>' + (p.subtitle ? '<br/>' + esc(p.subtitle) : ''))
        .addTo(layer);
      points.push([p.latitude, p.longitude]);
    });
    if (state.fit && !fitted && points.length > 1) {
      fitted = true;
      map.fitBounds(points, { padding: [40, 40], maxZoom: 17 });
    }
  };
  window.flyTo = function (lat, lng, zoom) { map.flyTo([lat, lng], zoom || map.getZoom(), { duration: 0.6 }); };
  map.on('moveend', function () {
    var c = map.getCenter();
    send({ type: 'center', latitude: c.lat, longitude: c.lng });
  });
  send({ type: 'ready' });
</script>
</body></html>`;
}

// Leaflet + OpenStreetMap in a WebView (same approach as the Map tab on Android),
// so it renders the same on both platforms without a Google Maps key. OSM street
// tiles are used because they show the small landmarks people actually meet at.
export default function MeetupMap({
  initialCenter,
  initialZoom = 16,
  meetup,
  meetupLabel,
  people,
  me,
  focus,
  pickMode = false,
  onCenterChange,
  fitToContent = false,
  isDark,
}: MeetupMapProps) {
  const webViewRef = useRef<WebView>(null);
  const readyRef = useRef(false);
  // Built once per mount; later changes are injected.
  const [html] = useState(() => buildHtml(initialCenter, initialZoom, isDark));

  const state = useMemo(
    () => ({ dark: isDark, meetup: pickMode ? null : (meetup ?? null), meetupLabel, people: people ?? [], me: me ?? null, fit: fitToContent }),
    [isDark, pickMode, meetup, meetupLabel, people, me, fitToContent]
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

  const focusRef = useRef(focus ?? null);
  useEffect(() => {
    focusRef.current = focus ?? null;
    if (readyRef.current && focus) {
      webViewRef.current?.injectJavaScript(`window.flyTo && window.flyTo(${focus.latitude}, ${focus.longitude}, ${focus.zoom ?? 0}); true;`);
    }
  }, [focus]);

  function handleMessage(event: WebViewMessageEvent) {
    let message: { type?: string; latitude?: number; longitude?: number };
    try {
      message = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (message.type === 'ready') {
      readyRef.current = true;
      pushState();
    } else if (message.type === 'center' && message.latitude !== undefined && message.longitude !== undefined) {
      onCenterChange?.({ latitude: message.latitude, longitude: message.longitude });
    }
  }

  return (
    <View style={{ flex: 1 }}>
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
      {pickMode ? (
        // Fixed center pin: its tip sits exactly on the map center that gets reported.
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ alignItems: 'center', marginBottom: 34 }}>
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                borderBottomLeftRadius: 0,
                transform: [{ rotate: '-45deg' }],
                backgroundColor: PIN_COLOR,
                borderWidth: 2,
                borderColor: '#FFFFFF',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#FFFFFF' }} />
            </View>
            <View style={{ marginTop: 2, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(0,0,0,0.35)' }} />
          </View>
        </View>
      ) : null}
    </View>
  );
}
