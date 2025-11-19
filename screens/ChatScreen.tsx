import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Button,
  FlatList,
  StyleSheet,
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
} from "../firebase"; // Path ke firebase.ts
import { messagesCollection } from "../firebase"; // Path ke firebase.ts
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../App"; // Ambil tipe dari App.tsx

// Tipe untuk objek pesan
type MessageType = {
  id: string;
  text: string;
  user: string;
  createdAt: { seconds: number; nanoseconds: number } | null;
};

// Tipe untuk props screen ini
type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route }: Props) {
  const { name } = route.params; // Ambil nama dari LoginScreen
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<MessageType[]>([]);

  // Mengambil pesan dari Firestore secara real-time
  useEffect(() => {
    const q = query(messagesCollection, orderBy("createdAt", "asc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const list: MessageType[] = [];
      snapshot.forEach((doc) => {
        list.push({
          id: doc.id,
          ...(doc.data() as Omit<MessageType, "id">),
        });
      });
      setMessages(list);
    });

    return () => unsub();
  }, []);

  // Mengirim pesan ke Firestore
  const sendMessage = async () => {
    if (!message.trim()) return;

    await addDoc(messagesCollection, {
      text: message,
      user: name,
      createdAt: serverTimestamp(),
    });

    setMessage(""); // Kosongkan input setelah dikirim
  };

  // Render satu item (chat bubble)
  const renderItem = ({ item }: { item: MessageType }) => (
    <View
      style={[
        styles.msgBox,
        item.user === name ? styles.myMsg : styles.otherMsg,
      ]}
    >
      <Text style={styles.sender}>{item.user}</Text>
      <Text>{item.text}</Text>
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      {/* Daftar Pesan */}
      <FlatList
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10 }}
      />

      {/* Input Row (Text Input + Tombol) */}
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
  );
}

// Styles
const styles = StyleSheet.create({
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
  },
  input: {
    flex: 1,
    borderWidth: 1,
    marginRight: 10,
    padding: 8,
    borderRadius: 6,
  },
});