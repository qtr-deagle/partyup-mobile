import { GUILD_COLORS, hexToHsl, hslToHex, isHexColor, isReadableOnWhite } from '@/lib/guilds';
import { Check, Palette } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, TouchableOpacity, View, type GestureResponderEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

const THUMB_SIZE = 24;
const TRACK_HEIGHT = 14;
const SATURATION = 72;
// The shade slider runs dark -> bright at a fixed saturation.
const MIN_LIGHTNESS = 16;
const MAX_LIGHTNESS = 62;

const lightnessFor = (shade: number) => MIN_LIGHTNESS + (shade / 100) * (MAX_LIGHTNESS - MIN_LIGHTNESS);
const shadeFor = (lightness: number) => Math.max(0, Math.min(100, ((lightness - MIN_LIGHTNESS) / (MAX_LIGHTNESS - MIN_LIGHTNESS)) * 100));

// Same responder approach as CompatibilitySlider in FiltersModal: RNGH gestures
// don't activate inside this Modal + ScrollView stack. value is 0-100.
function GradientSlider({
  id,
  value,
  stops,
  thumbColor,
  onChange,
  onDraggingChange,
}: {
  id: string;
  value: number;
  stops: string[];
  thumbColor: string;
  onChange: (next: number) => void;
  onDraggingChange?: (dragging: boolean) => void;
}) {
  const [width, setWidth] = useState(0);
  const originX = useRef(0);
  const travel = Math.max(0, width - THUMB_SIZE);
  const thumbX = (value / 100) * travel;

  function update(pageX: number) {
    if (travel <= 0) return;
    const x = Math.max(0, Math.min(travel, pageX - originX.current - THUMB_SIZE / 2));
    onChange(Math.round((x / travel) * 100));
  }

  function end() {
    onDraggingChange?.(false);
  }

  return (
    <View
      style={{ height: 36, justifyContent: 'center' }}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onResponderGrant={(event: GestureResponderEvent) => {
        originX.current = event.nativeEvent.pageX - event.nativeEvent.locationX;
        onDraggingChange?.(true);
        update(event.nativeEvent.pageX);
      }}
      onResponderMove={(event: GestureResponderEvent) => update(event.nativeEvent.pageX)}
      onResponderRelease={end}
      onResponderTerminate={end}>
      <View pointerEvents="none" style={{ height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, overflow: 'hidden', marginHorizontal: THUMB_SIZE / 2 - 4 }}>
        {width > 0 ? (
          <Svg width="100%" height={TRACK_HEIGHT}>
            <Defs>
              <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
                {stops.map((stop, index) => (
                  <Stop key={`${stop}-${index}`} offset={index / (stops.length - 1)} stopColor={stop} />
                ))}
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height={TRACK_HEIGHT} fill={`url(#${id})`} />
          </Svg>
        ) : null}
      </View>
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: thumbX,
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          borderRadius: THUMB_SIZE / 2,
          backgroundColor: thumbColor,
          borderWidth: 3,
          borderColor: '#FFFFFF',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
          elevation: 3,
        }}
      />
    </View>
  );
}

type Props = {
  value: string;
  isDark: boolean;
  onChange: (hex: string) => void;
  // Lets the parent ScrollView stop scrolling while a slider is dragged.
  onDraggingChange?: (dragging: boolean) => void;
};

// Preset guild colors plus a custom hue/shade picker with a hex field. Colors
// too light for white text are flagged (the form blocks saving them).
export function GuildColorPicker({ value, isDark, onChange, onDraggingChange }: Props) {
  const isPreset = GUILD_COLORS.some((option) => option.toUpperCase() === value.toUpperCase());
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [hue, setHue] = useState(() => (isHexColor(value) ? hexToHsl(value).h : 220));
  const [shade, setShade] = useState(() => (isHexColor(value) ? shadeFor(hexToHsl(value).l) : 50));
  const [hexText, setHexText] = useState(value.toUpperCase());

  // Follow outside changes (preset tap, form reset when reopened).
  useEffect(() => {
    setHexText(value.toUpperCase());
  }, [value]);

  const primary = isDark ? 'text-white' : 'text-[#1B2340]';
  const secondary = isDark ? 'text-[#94A3B8]' : 'text-[#6C7A95]';
  const input = isDark ? 'border-[#22324B] bg-[#18253C] text-white' : 'border-[#DCE3EF] bg-[#F4F6FA] text-[#1B2340]';
  const selectedRing = isDark ? '#FFFFFF' : '#1B2340';
  const readable = isReadableOnWhite(value);

  function applySliders(nextHue: number, nextShade: number) {
    setHue(nextHue);
    setShade(nextShade);
    onChange(hslToHex(nextHue, SATURATION, lightnessFor(nextShade)));
  }

  function openCustom() {
    if (isHexColor(value)) {
      const hsl = hexToHsl(value);
      setHue(hsl.h);
      setShade(shadeFor(hsl.l));
    }
    setCustomOpen(true);
  }

  function handleHexText(text: string) {
    const next = (text.startsWith('#') ? text : `#${text}`).toUpperCase().slice(0, 7);
    setHexText(next);
    if (isHexColor(next)) {
      const hsl = hexToHsl(next);
      setHue(hsl.h);
      setShade(shadeFor(hsl.l));
      onChange(next);
    }
  }

  const hueStops = [0, 60, 120, 180, 240, 300, 360].map((h) => hslToHex(h, SATURATION, 45));
  const shadeStops = [0, 50, 100].map((t) => hslToHex(hue, SATURATION, lightnessFor(t)));

  return (
    <View>
      <View className="flex-row flex-wrap gap-2.5">
        {GUILD_COLORS.map((option) => {
          const selected = value.toUpperCase() === option.toUpperCase();
          return (
            <TouchableOpacity
              key={option}
              onPress={() => onChange(option)}
              accessibilityLabel={`Color ${option}`}
              className="h-9 w-9 items-center justify-center rounded-full"
              style={{ backgroundColor: option, borderWidth: 3, borderColor: selected ? selectedRing : 'transparent' }}>
              {selected ? <Check size={14} color="#FFFFFF" /> : null}
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={() => (customOpen ? setCustomOpen(false) : openCustom())}
          accessibilityLabel="Custom color"
          className="h-9 w-9 items-center justify-center rounded-full"
          style={{
            backgroundColor: isPreset ? (isDark ? '#22324B' : '#E7EAF2') : value,
            borderWidth: 3,
            borderColor: !isPreset ? selectedRing : 'transparent',
          }}>
          <Palette size={16} color={isPreset ? (isDark ? '#CBD5E1' : '#6B7590') : '#FFFFFF'} />
        </TouchableOpacity>
      </View>

      {customOpen ? (
        <View className="mt-3 gap-1">
          <Text className={`text-xs font-semibold ${secondary}`}>Hue</Text>
          <GradientSlider
            id="guild-hue"
            value={(hue / 360) * 100}
            stops={hueStops}
            thumbColor={hslToHex(hue, SATURATION, 45)}
            onChange={(next) => applySliders(Math.round((next / 100) * 360) % 360, shade)}
            onDraggingChange={onDraggingChange}
          />
          <Text className={`text-xs font-semibold ${secondary}`}>Shade</Text>
          <GradientSlider id="guild-shade" value={shade} stops={shadeStops} thumbColor={value} onChange={(next) => applySliders(hue, next)} onDraggingChange={onDraggingChange} />
          <View className="mt-1 flex-row items-center gap-3">
            <View className="h-10 w-10 rounded-xl" style={{ backgroundColor: isHexColor(value) ? value : '#000000' }} />
            <TextInput
              value={hexText}
              onChangeText={handleHexText}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={7}
              placeholder="#2563EB"
              placeholderTextColor={isDark ? '#64748B' : '#9AA3B1'}
              className={`flex-1 rounded-xl border px-4 py-2.5 text-[15px] ${input}`}
              accessibilityLabel="Hex color"
            />
          </View>
        </View>
      ) : null}

      {!readable ? (
        <Text className="mt-2 text-xs font-semibold text-[#DC2626]">Too light — white text on it won&apos;t be readable. Pick a darker shade.</Text>
      ) : customOpen ? (
        <Text className={`mt-2 text-xs ${secondary}`}>
          Used for your banner, emblem and buttons. <Text className={primary}>{value.toUpperCase()}</Text>
        </Text>
      ) : null}
    </View>
  );
}
