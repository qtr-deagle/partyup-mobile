import { AlertCircle, Car, CheckCircle2, Cog, LogOut, Shield, ShieldCheck, Star, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

const trustedCircle = [
  { id: 1, name: 'Mom', phone: '+1 (555) 123-4567' },
  { id: 2, name: 'Best Friend Sarah', phone: '+1 (555) 987-6543' },
  { id: 3, name: 'Dad', phone: '+1 (555) 456-7890' },
];

const reviews = [
  {
    id: 1,
    author: 'Sarah',
    date: '2 weeks ago',
    rating: 5,
    text: 'Amazing travel buddy! Very responsible and fun to be around.',
  },
  {
    id: 2,
    author: 'Mike',
    date: '1 month ago',
    rating: 5,
    text: 'Great communication and very reliable. Highly recommended!',
  },
  {
    id: 3,
    author: 'Emma',
    date: '2 months ago',
    rating: 4,
    text: 'Good company and flexible with plans. Would travel again!',
  },
];

function SectionCard({ children }: { children: React.ReactNode }) {
  return <View className="rounded-[22px] border border-[#E9EDF5] bg-white p-4 shadow-sm shadow-black/5">{children}</View>;
}

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <ScrollView className="flex-1 bg-[#F7F8FC]" contentContainerClassName="pb-28">
      <View className="border-b border-[#E5EAF2] bg-white px-4 py-4">
        <View className="flex-row items-center justify-between">
          <TouchableOpacity onPress={() => router.push('/modal')} className="h-10 w-10 items-center justify-center rounded-full">
            <Cog size={22} color="#2647B8" />
          </TouchableOpacity>
          <Text className="text-[30px] font-black text-[#2647B8]">Alex</Text>
          <View className="h-10 w-10" />
        </View>
      </View>

      <View className="px-4 pt-4 gap-5">
        <SectionCard>
          <View className="items-center">
            <View className="h-28 w-28 rounded-full bg-gradient-to-br from-[#D0DDF1] to-[#D8F1E9] bg-[#D5E4EE]" />

            <View className="mt-6 flex-row items-center gap-2">
              <Text className="text-[30px] font-black text-[#182847]">Alex, 25</Text>
              <ShieldCheck size={20} color="#00A56A" />
            </View>

            <Text className="mt-2 text-[18px] text-[#67748D]">San Francisco, CA</Text>

            <View className="mt-3 flex-row items-center gap-1">
              {Array.from({ length: 5 }).map((_, index) => (
                <Star key={index} size={18} color="#F4B400" fill="#F4B400" />
              ))}
            </View>

            <Text className="mt-1 text-[16px] text-[#67748D]">4.9 rating (12 reviews)</Text>

            <Text className="mt-6 text-[17px] leading-7 text-[#182847]">
              Adventure seeker and travel enthusiast! Love exploring new cultures, trying local food, and making new friends. Always up for hiking, museums, and spontaneous adventures.
            </Text>

            <View className="mt-6 w-full border-t border-[#E8ECF3] pt-6">
              <Text className="text-[18px] font-black text-[#182847]">Travel Experience</Text>

              <View className="mt-4 gap-4">
                {[
                  ['Countries Visited', '12'],
                  ['Solo Trips', '8'],
                  ['Group Trips', '4'],
                ].map(([label, value]) => (
                  <View key={label} className="flex-row items-center justify-between">
                    <Text className="text-[18px] text-[#67748D]">{label}</Text>
                    <Text className="text-[18px] font-extrabold text-[#182847]">{value}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View className="mt-6 w-full border-t border-[#E8ECF3] pt-6">
              <Text className="text-[18px] font-black text-[#182847]">Interests</Text>
              <View className="mt-4 flex-row flex-wrap gap-2.5">
                {['Hiking', 'Food Tours', 'Museums', 'Photography', 'Nightlife', 'Local Culture'].map((interest) => (
                  <View key={interest} className="rounded-full bg-[#F2F4F8] px-4 py-2">
                    <Text className="text-[15px] text-[#53617B]">{interest}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </SectionCard>

        <View className="rounded-[22px] border border-[#BEEFCB] bg-[#EFFCF3] p-4">
          <View className="flex-row items-start gap-3">
            <CheckCircle2 size={24} color="#00A56A" />
            <View className="flex-1">
              <Text className="text-[18px] font-black text-[#182847]">ID Verification</Text>
              <Text className="text-[18px] text-[#00A56A]">Verified</Text>
              <View className="mt-3 rounded-xl bg-[#D9F8E4] px-4 py-4">
                <Text className="text-[17px] leading-6 text-[#0F7B4B]">
                  ✓ Your identity is verified. You can now create and join trips!
                </Text>
              </View>
            </View>
          </View>
        </View>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <Shield size={22} color="#00A56A" />
            <Text className="text-[22px] font-black text-[#182847]">Other Verifications</Text>
          </View>

          <View className="mt-4 gap-3">
            {['Email Verified', 'Phone Verified'].map((item) => (
              <View key={item} className="flex-row items-center justify-between rounded-2xl bg-[#F4F8F6] px-4 py-4">
                <Text className="text-[17px] text-[#182847]">{item}</Text>
                <Text className="text-[20px] text-[#00A56A]">✓</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <Users size={22} color="#2647B8" />
            <Text className="text-[22px] font-black text-[#182847]">Trusted Circle</Text>
          </View>

          <View className="mt-4 gap-3">
            {trustedCircle.map((contact) => (
              <View key={contact.id} className="rounded-2xl bg-[#F3F4F7] px-4 py-4">
                <Text className="text-[18px] text-[#182847]">{contact.name}</Text>
                <Text className="mt-1 text-[15px] text-[#67748D]">{contact.phone}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity className="mt-4 rounded-2xl border border-[#D7DDE8] bg-white py-3.5">
            <Text className="text-center text-[17px] text-[#182847]">Add Contact</Text>
          </TouchableOpacity>
        </SectionCard>

        <SectionCard>
          <Text className="text-[22px] font-black text-[#182847]">Recent Reviews</Text>

          <View className="mt-4 gap-4">
            {reviews.map((review, index) => (
              <View key={review.id} className={`${index > 0 ? 'border-t border-[#E8ECF3] pt-4' : ''}`}>
                <View className="flex-row items-center justify-between">
                  <Text className="text-[18px] text-[#182847]">{review.author}</Text>
                  <Text className="text-[15px] text-[#67748D]">{review.date}</Text>
                </View>
                <View className="mt-2 flex-row items-center gap-1">
                  {Array.from({ length: review.rating }).map((_, starIndex) => (
                    <Star key={starIndex} size={15} color="#F4B400" fill="#F4B400" />
                  ))}
                </View>
                <Text className="mt-2 text-[17px] leading-6 text-[#67748D]">{review.text}</Text>
              </View>
            ))}
          </View>
        </SectionCard>

        <SectionCard>
          <View className="flex-row items-center gap-2">
            <AlertCircle size={22} color="#E32727" />
            <Text className="text-[22px] font-black text-[#182847]">Emergency Settings</Text>
          </View>
          <Text className="mt-4 text-[17px] leading-6 text-[#67748D]">
            When you activate SOS, your location will be shared with your trusted circle and our safety team.
          </Text>
          <TouchableOpacity className="mt-4 rounded-2xl bg-[#E32727] py-4">
            <Text className="text-center text-[17px] font-bold text-white">Manage Emergency Contacts</Text>
          </TouchableOpacity>
        </SectionCard>

        <TouchableOpacity onPress={() => router.push('/vehicles')} className="flex-row items-center justify-center gap-2 rounded-2xl border border-[#2647B8] bg-white py-4">
          <Car size={20} color="#2647B8" />
          <Text className="text-[17px] font-medium text-[#2647B8]">My Vehicles</Text>
        </TouchableOpacity>

        <TouchableOpacity className="flex-row items-center justify-center gap-2 rounded-2xl border border-[#FF4D4D] bg-white py-4">
          <LogOut size={20} color="#E32727" />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
