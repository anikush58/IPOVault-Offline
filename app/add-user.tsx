import React from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useDB } from '@/context/DBContext';
import { AddUserModal } from '@/components/AddUserModal';

export default function AddUserScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ userId?: string }>();
  const { users } = useDB();

  const existingUser = params.userId ? users.find((u) => u.id === params.userId) : null;

  return (
    <AddUserModal
      visible={true}
      user={existingUser}
      onClose={() => router.back()}
    />
  );
}
