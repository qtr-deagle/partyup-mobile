import { Redirect, useRouter } from 'expo-router';
import { Car, Star } from 'lucide-react-native';
import { useState } from 'react';
import { Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAuth } from '@/hooks/auth-provider';

const vehicleStats = [
  { label: 'My Vehicles', value: '2' },
  { label: 'Trips Used', value: '12' },
];

const vehicleCards = [
  {
    id: 1,
    name: 'Toyota Camry 2023',
    rating: '4.9',
    trips: '28 trips',
    status: 'Ready',
    statusDetail: 'for carpooling',
    seats: '5',
    transmission: 'Automatic',
    fuel: 'Hybrid',
    color: 'Pearl White',
    responseTime: 'Typically replies in 2 hours',
  },
];

export default function VehiclesScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const [addVehicleVisible, setAddVehicleVisible] = useState(false);

  if (loading) {
    return null;
  }

  if (!session) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <View className="flex-1 bg-[#F8FAFD]">
      <View className="border-b border-black/5 bg-white px-4 pb-5 pt-14">
        <View className="flex-row items-start justify-between gap-4">
          <View className="flex-1">
            <Text className="text-[32px] font-black text-[#17233F]">My Vehicles</Text>
            <Text className="mt-2 text-[16px] leading-6 text-[#6B7590]">Track your personal vehicles for carpooling and trips</Text>
          </View>
          <View className="items-end gap-3">
            <TouchableOpacity
              onPress={() => router.back()}
              className="h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm shadow-black/10"
            >
              <Text className="text-[22px] text-[#6B7590]">×</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setAddVehicleVisible(true)}
              className="flex-row items-center gap-2 self-end rounded-full bg-[#2747C7] px-4 py-3"
            >
              <Text className="text-[18px] text-white">+</Text>
              <Text className="text-[16px] font-bold text-white">Add Vehicle</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View className="mt-6 flex-row gap-3">
          {vehicleStats.map((stat) => (
            <View key={stat.label} className="flex-1 rounded-[20px] border border-[#E2E7F0] bg-white px-4 py-4 shadow-sm shadow-black/5">
              <Text className="text-[16px] text-[#6B7590]">{stat.label}</Text>
              <Text className="mt-2 text-[30px] font-black text-[#17233F]">{stat.value}</Text>
            </View>
          ))}
        </View>
      </View>

      <ScrollView className="flex-1 px-4 pt-4" contentContainerClassName="pb-10">
        <View className="rounded-[24px] border border-[#E2E7F0] bg-white p-4 shadow-sm shadow-black/5">
          <View className="items-center">
            <View className="h-24 w-24 items-center justify-center rounded-3xl bg-[#F7F8FC]">
              <Car size={36} color="#E34B4B" />
            </View>
          </View>

          {vehicleCards.map((vehicle) => (
            <View key={vehicle.id} className="mt-5">
              <View className="flex-row items-start justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[22px] font-black text-[#17233F]">{vehicle.name}</Text>
                  <View className="mt-1 flex-row items-center gap-1.5">
                    <Star size={16} color="#F4B400" fill="#F4B400" />
                    <Text className="text-[16px] font-semibold text-[#17233F]">{vehicle.rating}</Text>
                    <Text className="text-[16px] text-[#6B7590]">({vehicle.trips})</Text>
                  </View>
                </View>
                <View className="items-end">
                  <Text className="text-[18px] font-bold text-[#2747C7]">{vehicle.status}</Text>
                  <Text className="text-[16px] text-[#6B7590]">{vehicle.statusDetail}</Text>
                </View>
              </View>

              <View className="mt-4 flex-row flex-wrap gap-2">
                <View className="w-[49%] rounded-[16px] border border-[#E2E7F0] bg-[#FBFCFE] px-3 py-3">
                  <Text className="text-[15px] text-[#6B7590]">Seats</Text>
                  <Text className="mt-1 text-[16px] font-semibold text-[#17233F]">{vehicle.seats}</Text>
                </View>
                <View className="w-[49%] rounded-[16px] border border-[#E2E7F0] bg-[#FBFCFE] px-3 py-3">
                  <Text className="text-[15px] text-[#6B7590]">Transmission</Text>
                  <Text className="mt-1 text-[16px] font-semibold text-[#17233F]">{vehicle.transmission}</Text>
                </View>
                <View className="w-[49%] rounded-[16px] border border-[#E2E7F0] bg-[#FBFCFE] px-3 py-3">
                  <Text className="text-[15px] text-[#6B7590]">Fuel</Text>
                  <Text className="mt-1 text-[16px] font-semibold text-[#17233F]">{vehicle.fuel}</Text>
                </View>
                <View className="w-[49%] rounded-[16px] border border-[#E2E7F0] bg-[#FBFCFE] px-3 py-3">
                  <Text className="text-[15px] text-[#6B7590]">Color</Text>
                  <Text className="mt-1 text-[16px] font-semibold text-[#17233F]">{vehicle.color}</Text>
                </View>
              </View>

              <View className="mt-3 rounded-[16px] border border-[#BFE5D1] bg-[#EAF8F0] px-3 py-3">
                <Text className="text-[15px] text-[#6B7590]">Response Time</Text>
                <Text className="mt-1 text-[16px] font-semibold text-[#17233F]">{vehicle.responseTime}</Text>
              </View>

              <View className="mt-4 flex-row gap-3">
                <TouchableOpacity className="flex-1 rounded-2xl bg-[#2747C7] py-3.5">
                  <Text className="text-center text-[16px] font-bold text-white">Edit</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 rounded-2xl bg-[#F3F5FA] py-3.5">
                  <Text className="text-center text-[16px] font-bold text-[#17233F]">View Details</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Modal visible={addVehicleVisible} transparent animationType="fade" onRequestClose={() => setAddVehicleVisible(false)}>
        <View className="flex-1 items-center justify-center bg-black/45 px-4">
          <View className="w-full max-w-[420px] rounded-[28px] bg-white px-4 py-5 shadow-lg shadow-black/25">
            <View className="flex-row items-start justify-between gap-4 border-b border-[#E5EAF2] pb-4">
              <View className="flex-1">
                <Text className="text-[24px] font-black text-[#1B2740]">Add My Vehicle</Text>
                <Text className="mt-2 text-[16px] leading-6 text-[#6B7590]">Track your personal vehicle for carpooling</Text>
              </View>
              <TouchableOpacity onPress={() => setAddVehicleVisible(false)} className="h-9 w-9 items-center justify-center rounded-full bg-[#F3F5FA]">
                <Text className="text-[20px] text-[#6B7590]">×</Text>
              </TouchableOpacity>
            </View>

            <View className="pt-4 gap-4">
              <View>
                <Text className="text-[14px] font-extrabold tracking-wide text-[#6B7590]">VEHICLE MODEL *</Text>
                <TextInput
                  className="mt-2 rounded-2xl border border-[#E0E5EF] bg-[#F7F8FC] px-4 py-4 text-[16px] text-[#17233F]"
                  placeholder="e.g., Toyota Camry 2023"
                  placeholderTextColor="#A1A8B8"
                />
              </View>

              <View className="flex-row gap-3">
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold tracking-wide text-[#6B7590]">YEAR</Text>
                  <TextInput
                    className="mt-2 rounded-2xl border border-[#E0E5EF] bg-[#F7F8FC] px-4 py-4 text-[16px] text-[#17233F]"
                    defaultValue="2026"
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-[14px] font-extrabold tracking-wide text-[#6B7590]">SEATS</Text>
                  <TextInput
                    className="mt-2 rounded-2xl border border-[#E0E5EF] bg-[#F7F8FC] px-4 py-4 text-[16px] text-[#17233F]"
                    defaultValue="5 seats"
                  />
                </View>
              </View>

              <View>
                <Text className="text-[14px] font-extrabold tracking-wide text-[#6B7590]">DESCRIPTION</Text>
                <TextInput
                  className="mt-2 min-h-[88px] rounded-2xl border border-[#E0E5EF] bg-[#F7F8FC] px-4 py-4 text-[16px] text-[#17233F]"
                  placeholder="Describe your vehicle (color, features, condition)..."
                  placeholderTextColor="#A1A8B8"
                  multiline
                />
              </View>

              <View className="flex-row gap-3 border-t border-[#E5EAF2] pt-4">
                <TouchableOpacity onPress={() => setAddVehicleVisible(false)} className="flex-1 rounded-2xl bg-[#F3F5FA] py-4">
                  <Text className="text-center text-[16px] font-bold text-[#1B2740]">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity className="flex-1 rounded-2xl bg-[#2747C7] py-4">
                  <Text className="text-center text-[16px] font-bold text-white">Add Vehicle</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}