import MeetupMap, { type LatLng } from '@/components/MeetupMap';
import MunicipalityPicker from '@/components/MunicipalityPicker';
import { BULACAN_CENTERS, BULACAN_MUNICIPALITIES, OUTSIDE_BULACAN, type BulacanMunicipality } from '@/lib/bulacan';
import * as Location from 'expo-location';
import { ChevronDown, Crosshair, MapPin, Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { showAlert } from '@/lib/dialog';
export type MeetupDraft = {
  municipality: string | null;
  landmark: string;
  pin: LatLng | null;
};

export const EMPTY_MEETUP: MeetupDraft = { municipality: null, landmark: '', pin: null };

const MEETUP_OPTIONS = [...BULACAN_MUNICIPALITIES, OUTSIDE_BULACAN] as const;
type MeetupOption = (typeof MEETUP_OPTIONS)[number];

// Malolos, the provincial capital -- where the map opens with nothing picked yet.
const DEFAULT_CENTER = BULACAN_CENTERS.Malolos;

function centerFor(municipality: string | null): LatLng {
  return (municipality && BULACAN_CENTERS[municipality as BulacanMunicipality]) || DEFAULT_CENTER;
}

// "Jollibee, MacArthur Highway" from a reverse-geocode result, for prefilling the landmark.
function describePlace(place: Location.LocationGeocodedAddress | undefined) {
  if (!place) {
    return '';
  }
  const parts = [place.name, place.street].filter((part, index, all): part is string => !!part && all.indexOf(part) === index);
  return parts.join(', ');
}

type Props = {
  label: string;
  value: MeetupDraft;
  onChange: (next: MeetupDraft) => void;
  isDark: boolean;
  landmarkPlaceholder?: string;
};

export default function MeetupLocationPicker({ label, value, onChange, isDark, landmarkPlaceholder }: Props) {
  const insets = useSafeAreaInsets();
  const border = isDark ? 'border-[#22324B]' : 'border-[#E4EAF2]';
  const inputBg = isDark ? 'bg-[#111B2E]' : 'bg-white';
  const inputText = isDark ? 'text-white' : 'text-[#17233F]';
  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const placeholderColor = isDark ? '#64748B' : '#9AA3B1';

  const [showMunicipalities, setShowMunicipalities] = useState(false);
  const [showMap, setShowMap] = useState(false);
  // Pick-mode map state, only committed to `value` on "Set meetup pin".
  const [draftCenter, setDraftCenter] = useState<LatLng>(DEFAULT_CENTER);
  const [mapStart, setMapStart] = useState<LatLng>(DEFAULT_CENTER);
  const [focus, setFocus] = useState<(LatLng & { zoom?: number }) | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [confirming, setConfirming] = useState(false);

  function selectMunicipality(municipality: MeetupOption) {
    // A pin from another town is almost certainly stale -- make them re-pin.
    const keepPin = municipality === value.municipality;
    onChange({ ...value, municipality, pin: keepPin ? value.pin : null });
    if (!keepPin) {
      // Go straight to pinning, after the dropdown's modal finishes closing
      // (iOS won't present a modal while another is still dismissing).
      setTimeout(() => openMap(centerFor(municipality)), 450);
    }
  }

  function openMap(center: LatLng) {
    setMapStart(center);
    setDraftCenter(center);
    setFocus(null);
    setQuery('');
    setShowMap(true);
  }

  async function handleSearch() {
    const text = query.trim();
    if (!text) {
      return;
    }
    setSearching(true);
    try {
      const inTown = value.municipality && value.municipality !== OUTSIDE_BULACAN ? `, ${value.municipality}, Bulacan` : '';
      let results = await Location.geocodeAsync(`${text}${inTown}, Philippines`);
      if (!results[0] && inTown) {
        results = await Location.geocodeAsync(`${text}, Philippines`);
      }
      if (results[0]) {
        setFocus({ latitude: results[0].latitude, longitude: results[0].longitude, zoom: 17 });
      } else {
        showAlert('Place not found', 'Try a nearby landmark or street, or drag the map to the spot.');
      }
    } catch {
      showAlert('Search unavailable', 'Drag the map to the meetup spot instead.');
    } finally {
      setSearching(false);
    }
  }

  async function handleUseMyLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        showAlert('Location permission needed', 'Allow location access, or drag the map to the meetup spot.');
        return;
      }
      const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setFocus({ latitude: position.coords.latitude, longitude: position.coords.longitude, zoom: 18 });
    } catch {
      showAlert('Location unavailable', 'Drag the map to the meetup spot instead.');
    } finally {
      setLocating(false);
    }
  }

  async function handleConfirmPin() {
    const pin = draftCenter;
    let landmark = value.landmark;
    if (!landmark.trim()) {
      setConfirming(true);
      try {
        landmark = describePlace((await Location.reverseGeocodeAsync(pin))[0]);
      } catch {
        // Prefill is a convenience only; the creator types it otherwise.
      }
      setConfirming(false);
    }
    onChange({ ...value, pin, landmark });
    setShowMap(false);
  }

  return (
    <View>
      <Text className={`mb-2 text-[13px] font-bold ${secondary}`}>{label}</Text>

      <TouchableOpacity
        onPress={() => setShowMunicipalities(true)}
        className={`flex-row items-center gap-2 rounded-2xl border px-4 py-4 ${border} ${inputBg}`}
      >
        <MapPin size={18} color={value.municipality ? '#2A55D4' : placeholderColor} />
        <Text className={`flex-1 text-base ${value.municipality ? inputText : ''}`} style={!value.municipality ? { color: placeholderColor } : undefined}>
          {value.municipality ?? 'Select city / municipality'}
        </Text>
        <ChevronDown size={18} color={placeholderColor} />
      </TouchableOpacity>

      {value.pin ? (
        <TouchableOpacity onPress={() => openMap(value.pin ?? centerFor(value.municipality))} activeOpacity={0.85} className={`mt-2 overflow-hidden rounded-2xl border ${border}`}>
          <View style={{ height: 150 }} pointerEvents="none">
            <MeetupMap key={`${value.pin.latitude},${value.pin.longitude}`} initialCenter={value.pin} initialZoom={17} meetup={value.pin} isDark={isDark} />
          </View>
          <View className={`flex-row items-center justify-between px-4 py-2.5 ${inputBg}`}>
            <Text className={`text-[12px] ${secondary}`}>
              {value.pin.latitude.toFixed(5)}, {value.pin.longitude.toFixed(5)}
            </Text>
            <Text className="text-sm font-bold text-[#2A55D4]">Move pin</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          onPress={() => openMap(value.pin ?? centerFor(value.municipality))}
          className={`mt-2 flex-row items-center justify-center gap-2 rounded-2xl border border-dashed px-4 py-3.5 ${border}`}
        >
          <Crosshair size={16} color="#2A55D4" />
          <Text className="text-sm font-bold text-[#2A55D4]">Pin exact meetup spot on map</Text>
        </TouchableOpacity>
      )}

      <TextInput
        className={`mt-2 rounded-2xl border px-4 py-4 text-base ${border} ${inputBg} ${inputText}`}
        placeholder={landmarkPlaceholder ?? 'Specific spot, e.g. Jollibee MacArthur Hwy, front entrance'}
        placeholderTextColor={placeholderColor}
        maxLength={80}
        value={value.landmark}
        onChangeText={(landmark) => onChange({ ...value, landmark })}
      />
      <Text className={`mt-1.5 text-[12px] leading-4 ${secondary}`}>Riders see this pin and landmark on the trip page and can open it in Maps.</Text>

      <MunicipalityPicker<MeetupOption>
        visible={showMunicipalities}
        selected={value.municipality}
        title="Meetup city / municipality"
        subtitle="Pick where riders will meet you."
        options={MEETUP_OPTIONS}
        onSelect={selectMunicipality}
        onClose={() => setShowMunicipalities(false)}
      />

      <Modal visible={showMap} animationType="slide" onRequestClose={() => setShowMap(false)}>
        <View className={`flex-1 ${isDark ? 'bg-[#0B1220]' : 'bg-[#F6F8FC]'}`} style={{ paddingTop: insets.top + 8, paddingBottom: insets.bottom }}>
          <View className="flex-row items-center gap-2 px-4 pb-3">
            <TouchableOpacity onPress={() => setShowMap(false)} className="h-10 w-10 items-center justify-center" accessibilityLabel="Close map">
              <X size={22} color={isDark ? '#FFFFFF' : '#1B2340'} />
            </TouchableOpacity>
            <View className={`h-11 flex-1 flex-row items-center rounded-xl border px-3 ${border} ${inputBg}`}>
              <Search size={16} color="#7C8798" />
              <TextInput
                className={`ml-2 flex-1 text-base ${inputText}`}
                placeholder={value.municipality && value.municipality !== OUTSIDE_BULACAN ? `Search in ${value.municipality}` : 'Search a place'}
                placeholderTextColor={placeholderColor}
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={handleSearch}
                returnKeyType="search"
                autoCorrect={false}
              />
              {searching ? <ActivityIndicator size="small" color="#2A55D4" /> : null}
            </View>
          </View>

          <View className="flex-1">
            <MeetupMap initialCenter={mapStart} initialZoom={16} focus={focus} pickMode onCenterChange={setDraftCenter} isDark={isDark} />
            <TouchableOpacity
              onPress={handleUseMyLocation}
              disabled={locating}
              className="absolute bottom-4 right-4 h-12 w-12 items-center justify-center rounded-full bg-white shadow-md shadow-black/20"
              accessibilityLabel="Use my current location"
            >
              {locating ? <ActivityIndicator color="#2A55D4" /> : <Crosshair size={22} color="#2A55D4" />}
            </TouchableOpacity>
          </View>

          <View className="gap-3 px-4 pt-3">
            <Text className={`text-sm ${primary}`}>Drag the map so the red pin sits exactly on the meetup spot.</Text>
            <Text className={`text-[12px] ${secondary}`}>
              {draftCenter.latitude.toFixed(5)}, {draftCenter.longitude.toFixed(5)}
            </Text>
            <TouchableOpacity onPress={handleConfirmPin} disabled={confirming} className="rounded-2xl bg-[#2A55D4] py-4">
              {confirming ? <ActivityIndicator color="#FFFFFF" /> : <Text className="text-center text-base font-bold text-white">Set meetup pin</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
