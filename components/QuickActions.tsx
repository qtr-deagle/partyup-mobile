import { IconSymbol } from '@/components/ui/icon-symbol';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';

interface QuickAction {
  id: string;
  title: string;
  icon: string;
  color: string;
  onPress?: () => void;
}

interface QuickActionsProps {
  actions: QuickAction[];
  columns?: 3 | 4;
}

export default function QuickActions({ actions, columns = 3 }: QuickActionsProps) {
  const getColumnStyle = () => {
    return columns === 3 ? 'w-1/3' : 'w-1/4';
  };

  return (
    <View className="flex-row flex-wrap gap-2">
      {actions.map((action) => (
        <TouchableOpacity
          key={action.id}
          onPress={action.onPress}
          className={`${getColumnStyle()} items-center py-4 px-2 rounded-xl bg-white border border-gray-100 active:bg-gray-50`}
        >
          <View
            className="w-12 h-12 rounded-lg items-center justify-center mb-2"
            style={{ backgroundColor: action.color + '20' }}
          >
            <IconSymbol
              size={24}
              name={action.icon as any}
              color={action.color}
            />
          </View>
          <Text className="text-xs font-semibold text-black text-center" numberOfLines={2}>
            {action.title}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
