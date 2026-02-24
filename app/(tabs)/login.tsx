import { useRouter } from 'expo-router';
import LoginScreen from '@/screens/LoginScreen';

export default function LoginTab() {
  const router = useRouter();

  return (
    <LoginScreen
      onGuestContinue={() => router.replace('/(tabs)')}
    />
  );
}
