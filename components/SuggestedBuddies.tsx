import { IconSymbol } from '@/components/ui/icon-symbol';
import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

interface Traveler {
  id: number;
  name: string;
  destination: string;
  distance?: string;
  rating: number;
  reviews?: number;
  match?: number;
  status?: 'active' | 'inactive';
}

interface SuggestedBuddiesProps {
  travelers: Traveler[];
  title?: string;
  onTravelerPress?: (traveler: Traveler) => void;
}

export default function SuggestedBuddies({
  travelers,
  title = 'Suggested Buddies',
  onTravelerPress,
}: SuggestedBuddiesProps) {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100">
      <Text className="text-lg font-bold text-black mb-4">{title}</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="gap-3"
        scrollEventThrottle={16}
      >
        {travelers.map((traveler) => (
          <TouchableOpacity
            key={traveler.id}
            onPress={() => onTravelerPress?.(traveler)}
            className="min-w-48 bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200"
          >
            {/* Header */}
            <View className="flex-row items-start justify-between mb-3">
              <View className="flex-row gap-2 flex-1">
                <View className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-800 rounded-full items-center justify-center">
                  <Text className="text-white font-bold">{traveler.name[0]}</Text>
                </View>
                <View className="flex-1">
                  <Text className="text-sm font-bold text-black">{traveler.name}</Text>
                  <Text className="text-xs text-gray-600">{traveler.destination}</Text>
                </View>
              </View>
              {traveler.status === 'active' && (
                <View className="w-2.5 h-2.5 bg-green-500 rounded-full" />
              )}
            </View>

            {/* Stats */}
            <View className="gap-2 mb-3 pb-3 border-b border-blue-200">
              <View className="flex-row items-center gap-1">
                <IconSymbol size={14} name="star.fill" color="#F59E0B" />
                <Text className="text-xs font-semibold text-black">{traveler.rating}</Text>
                {traveler.reviews && <Text className="text-xs text-gray-600">({traveler.reviews})</Text>}
              </View>
              {traveler.distance && (
                <View className="flex-row items-center gap-1">
                  <IconSymbol size={14} name="location.fill" color="#3B82F6" />
                  <Text className="text-xs text-gray-600">{traveler.distance}</Text>
                </View>
              )}
              {traveler.match && (
                <View className="flex-row items-center gap-1">
                  <IconSymbol size={14} name="checkmark.circle.fill" color="#10B981" />
                  <Text className="text-xs font-semibold text-black">{traveler.match}% match</Text>
                </View>
              )}
            </View>

            {/* Button */}
            <TouchableOpacity className="bg-blue-800 rounded-lg py-2">
              <Text className="text-white text-xs font-semibold text-center">Connect</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}
