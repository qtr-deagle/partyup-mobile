import { IconSymbol } from '@/components/ui/icon-symbol';
import { ScrollView, Text, View } from 'react-native';

interface ActivityItem {
  id: number;
  type: 'match' | 'update' | 'alert' | 'review';
  message: string;
  time: string;
}

const activities: ActivityItem[] = [
  { id: 1, type: 'match', message: 'Sarah accepted your request', time: '2 min ago' },
  { id: 2, type: 'update', message: 'Mike updated pickup time to 2:00 PM', time: '15 min ago' },
  { id: 3, type: 'alert', message: 'Route adjusted due to traffic', time: '1 hour ago' },
  { id: 4, type: 'review', message: 'You received a 5-star review from John', time: '2 hours ago' },
];

const getActivityIcon = (type: string) => {
  switch (type) {
    case 'match':
      return 'checkmark.circle.fill';
    case 'update':
      return 'clock.fill';
    case 'alert':
      return 'exclamationmark.triangle.fill';
    case 'review':
      return 'star.fill';
    default:
      return 'circle.fill';
  }
};

const getActivityColor = (type: string) => {
  switch (type) {
    case 'match':
      return '#10B981';
    case 'update':
      return '#3B82F6';
    case 'alert':
      return '#F59E0B';
    case 'review':
      return '#8B5CF6';
    default:
      return '#6B7280';
  }
};

export default function ActivityFeed() {
  return (
    <View className="bg-white rounded-2xl p-4 border border-gray-100">
      <Text className="text-lg font-bold text-black mb-4">Activity Feed</Text>
      <ScrollView scrollEnabled={false} className="space-y-3">
        {activities.map((activity) => (
          <View key={activity.id} className="flex-row items-start gap-3 pb-3 border-b border-gray-100">
            <View className="mt-1">
              <IconSymbol 
                size={20} 
                name={getActivityIcon(activity.type) as any}
                color={getActivityColor(activity.type)}
              />
            </View>
            <View className="flex-1">
              <Text className="text-sm text-black font-medium">{activity.message}</Text>
              <Text className="text-xs text-gray-500 mt-1">{activity.time}</Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
