import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator } from "react-native";
import LoginScreen from "./screens/LoginScreen";
import RegisterScreen from "./screens/RegisterScreen";
import ChatScreen from "./screens/ChatScreen";
import { auth, onAuthStateChanged } from "./firebase";
import { User } from "firebase/auth";
import { storage } from "./utils/storage";

export type RootStackParamList = {
  Login: undefined;
  Register: undefined;
  Chat: { name: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);
  
  // State untuk memantau login via MMKV (agar logout offline jalan real-time)
  const [hasLocalSession, setHasLocalSession] = useState<boolean>(
    !!storage.getString('user.uid')
  );
  
  // State lokal untuk nama
  const [localName, setLocalName] = useState<string | null>(() => {
      return storage.getString('user.name') || null;
  });

  useEffect(() => {
    // 1. LISTENER MMKV (PENTING UNTUK LOGOUT & REGISTER)
    const listener = storage.addOnValueChangedListener((changedKey) => {
      // Jika user.uid berubah/dihapus (saat logout), update state sesi
      if (changedKey === 'user.uid') {
        const uid = storage.getString('user.uid');
        setHasLocalSession(!!uid);
      }
      // Jika user.name berubah (saat register), update nama
      if (changedKey === 'user.name') {
        const newName = storage.getString('user.name');
        if (newName) setLocalName(newName);
      }
    });

    // 2. LISTENER FIREBASE AUTH
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      
      if (u) {
        const nameFromStorage = storage.getString('user.name');
        const displayName = u.displayName || u.email;
        if (displayName) {
            storage.set('user.name', displayName);
            setLocalName(displayName);
        } 
      } 
      // HAPUS ELSE YANG MERESET NAMA
      // Kita tidak mau mereset nama di memori jika logout terjadi karena koneksi putus.
      // Pembersihan data asli terjadi di tombol Logout (storage.clearAll).

      if (initializing) setInitializing(false);
    });

    return () => {
      listener.remove();
      unsubAuth();
    };
  }, []);

  

  if (initializing) {
    return (
      <View style={{flex: 1, justifyContent: 'center', alignItems: 'center'}}>
        <ActivityIndicator size="large" color="#0000ff" />
      </View>
    );
  }

  const finalName = localName || user?.displayName || user?.email || "Guest";
  const isLoggedIn = user || storage.getString('user.uid');

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {isLoggedIn ? (
          <Stack.Screen 
            name="Chat" 
            component={ChatScreen} 
            initialParams={{ name: finalName }} 
            options={{ title: `Chat: ${finalName}` }}
          />
        ) : (
          <Stack.Group screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </Stack.Group>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}