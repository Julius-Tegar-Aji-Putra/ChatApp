import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import LoginScreen from "./screens/LoginScreen"; // Pastikan path-nya benar
import ChatScreen from "./screens/ChatScreen";   // Pastikan path-nya benar
import { auth, onAuthStateChanged } from "./firebase";
import { User } from "firebase/auth";

// Mendefinisikan tipe untuk parameter navigasi
export type RootStackParamList = {
  Login: undefined;
  Chat: { name: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    // Di panduanmu ada signInAnonymously, tapi tidak dipakai di onAuthStateChanged
    // Kita ikuti panduanmu
    // signInAnonymously(auth).catch(console.error);

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });

    return () => unsub();
  }, []);

  // Baris ini dari slide, tapi sepertinya salah tempat
  // if (!user) return null; 
  // Seharusnya: Jika user TIDAK ADA, tampilkan Login. Jika ADA, tampilkan Chat.
  // Tapi App.tsx di slide tidak melakukan ini, ia hanya setup navigasi.
  // Kita ikuti slide apa adanya.

  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Chat" component={ChatScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}