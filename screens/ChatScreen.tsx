import React, { useEffect, useState, useLayoutEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  QuerySnapshot,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import {
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  messagesCollection,
  auth,
  signOut,
} from "../firebase";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App";
import Icon from "react-native-vector-icons/Feather";
import { storage } from "../utils/storage";
import { useHeaderHeight } from '@react-navigation/elements';

type MessageType = {
  id: string;
  text: string;
  user: string;
  createdAt: { seconds: number; nanoseconds: number } | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  // Kita tidak lagi bergantung 100% pada 'name' dari route.params untuk logika internal
  // agar data selalu fresh dari storage.
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<MessageType[]>([]);
  
  const headerHeight = useHeaderHeight();

  // --- HEADER & LOGOUT ---
  useLayoutEffect(() => {
    navigation.setOptions({
      // HAPUS BAGIAN TITLE DARI SINI
      // Biarkan App.tsx yang mengurus Title agar bisa update otomatis saat nama berubah
      
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
          <Icon name="log-out" size={24} color="#FF3B30" />
        </TouchableOpacity>
      ),
      headerBackVisible: false,
    });
  }, [navigation]);

  const handleLogout = () => {
    Alert.alert("Keluar", "Yakin ingin logout?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya",
        style: "destructive",
        onPress: async () => {
            storage.clearAll();
            await signOut(auth);
        },
      },
    ]);
  };

  // --- LOGIKA CHAT ---
  useEffect(() => {
    const q = query(messagesCollection, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot: QuerySnapshot) => {
      const list: MessageType[] = [];
      snapshot.forEach((doc: QueryDocumentSnapshot) => {
        list.push({
          id: doc.id,
          ...(doc.data() as Omit<MessageType, "id">),
        });
      });
      setMessages(list);
    });
    return () => unsub();
  }, []);

  const sendMessage = async () => {
    if (!message.trim()) return;

    // AMBIL NAMA TERBARU DARI MMKV (SOLUSI FIX)
    // Jika route.params.name masih 'email' karena race condition, 
    // storage pasti sudah punya 'username' yang benar.
    const currentUser = storage.getString('user.name') || auth.currentUser?.email || "Guest";

    await addDoc(messagesCollection, {
      text: message,
      user: currentUser, // Pakai nama yang benar
      createdAt: serverTimestamp(),
    });
    setMessage("");
  };

  const renderItem = ({ item }: { item: MessageType }) => {
    // Cek nama user saat ini untuk menentukan posisi bubble
    const currentUser = storage.getString('user.name') || auth.currentUser?.email || "Guest";
    const isMyMessage = item.user === currentUser;

    return (
      <View
        style={[
          styles.msgBox,
          isMyMessage ? styles.myMsg : styles.otherMsg,
        ]}
      >
        <Text style={styles.sender}>{item.user}</Text>
        <Text>{item.text}</Text>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? headerHeight : 0}
    >
      <View style={styles.container}>
        <FlatList
          data={messages}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            placeholder="Ketik pesan..."
            value={message}
            onChangeText={setMessage}
          />
          <Button title="Kirim" onPress={sendMessage} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f2f2f2', 
  },
  msgBox: {
    padding: 10,
    marginVertical: 6,
    borderRadius: 6,
    maxWidth: "80%",
  },
  myMsg: {
    backgroundColor: "#d1f0ff",
    alignSelf: "flex-end",
  },
  otherMsg: {
    backgroundColor: "#eee",
    alignSelf: "flex-start",
  },
  sender: {
    fontWeight: "bold",
    marginBottom: 2,
    fontSize: 12,
  },
  inputRow: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
  },
  input: {
    flex: 1,
    borderWidth: 1,
    marginRight: 10,
    padding: 8,
    borderRadius: 6,
  },
});