import { useCallback, useState } from 'react';
import { RefreshControl } from 'react-native';

// Swipe-down-to-reload for a ScrollView: pass `refreshControl` to its
// `refreshControl` prop. `load` should resolve once the screen's data is back.
export function usePullToRefresh(load: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  const refreshControl = <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#284BD6" colors={['#284BD6']} />;

  return { refreshing, refreshControl };
}
