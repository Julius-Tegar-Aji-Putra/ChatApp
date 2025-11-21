import React, { useEffect, useState, useLayoutEffect, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Image,
  ActivityIndicator,
  Modal, 
  Keyboard,
} from "react-native";
import { SafeAreaView } from 'react-native-safe-area-context';
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
import { storage as mmkvStorage } from "../utils/storage";
import { launchImageLibrary } from 'react-native-image-picker';

type MessageType = {
  id: string;
  text: string;
  image?: string;
  user: string;
  createdAt: { seconds: number; nanoseconds: number } | null;
};

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const { name } = route.params;
  const flatListRef = useRef<FlatList>(null);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
          <Icon name="log-out" size={24} color="#FF3B30" />
        </TouchableOpacity>
      ),
      headerBackVisible: false,
    });
  }, [navigation]);

  // Handle keyboard events
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        // Scroll ke bawah saat keyboard muncul
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );

    return () => {
      keyboardDidShowListener?.remove();
    };
  }, []);

  const handleLogout = () => {
    Alert.alert("Keluar", "Yakin ingin logout?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya",
        style: "destructive",
        onPress: async () => {
            mmkvStorage.clearAll();
            await signOut(auth);
        },
      },
    ]);
  };

  // --- 4. LOGIKA LOAD & SYNC CHAT ---
  useEffect(() => {
    let isMounted = true;

    // A. FUNGSI LOAD DATA OFFLINE
    const loadLocalChat = () => {
      const savedChat = mmkvStorage.getString('chat_history');
      if (savedChat) {
        try {
          const parsedChat = JSON.parse(savedChat);
          console.log(`[OFFLINE] Memuat ${parsedChat.length} pesan dari MMKV.`);
          if (isMounted) setMessages(parsedChat);
        } catch (e) {
          console.error("[OFFLINE] Gagal parse chat local:", e);
        }
      } else {
        console.log("[OFFLINE] Tidak ada data chat di MMKV.");
      }
    };

    // Load data lokal saat pertama kali mount
    loadLocalChat();

    // B. SYNC ONLINE
    const q = query(messagesCollection, orderBy("createdAt", "asc"));
    
    const unsub = onSnapshot(q, { includeMetadataChanges: true }, 
      (snapshot: QuerySnapshot) => {
      if (!isMounted) return;

      // Logika Guard: Jika snapshot kosong (mungkin baru konek atau offline), cek dulu
      // Apakah ini karena 'fromCache' (offline) dan kosong?
      const source = snapshot.metadata.fromCache ? "local cache" : "server";
      console.log(`[ONLINE] Snapshot update dari ${source}. Jumlah docs: ${snapshot.docs.length}`);

      if (snapshot.empty) {
          // Jika snapshot kosong, jangan hapus state messages yang mungkin sudah diisi dari MMKV
          // Kecuali kita yakin server memang kosong (tapi susah dibedakan saat error koneksi)
          console.log("[ONLINE] Snapshot kosong. Mempertahankan data yang ada di layar.");
          return;
      }

      const list: MessageType[] = [];
      snapshot.forEach((doc: QueryDocumentSnapshot) => {
        list.push({
          id: doc.id,
          ...(doc.data() as Omit<MessageType, "id">),
        });
      });

      // Selalu update UI dengan data terbaru dari snapshot (baik itu cache Firestore atau Server)
      setMessages(list);

      // Simpan ke MMKV sebagai backup manual kita
      if (list.length > 0) {
        mmkvStorage.set('chat_history', JSON.stringify(list));
        console.log("[SYNC] Chat tersimpan ke MMKV.");
      }
      
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    }, (error) => {
        // ERROR HANDLER PENTING!
        // Jika onSnapshot gagal total (biasanya karena permission atau koneksi parah),
        // JANGAN ubah state messages. Biarkan data dari loadLocalChat() tetap tampil.
        console.log("[ERROR] Firestore Error:", error.message);
        // Opsional: Coba load ulang dari MMKV untuk memastikan data tidak hilang dari layar
        loadLocalChat(); 
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const sendMessage = async (imageUrl: string | null = null) => {
    if (!message.trim() && !imageUrl) return;
    if (sending) return; 

    const currentUser = mmkvStorage.getString('user.name') || auth.currentUser?.email || "Guest";

    setSending(true);
    try {
      await addDoc(messagesCollection, {
        text: message,
        image: imageUrl,
        user: currentUser,
        createdAt: serverTimestamp(),
      });
      setMessage("");
    } catch (error: any) {
       Alert.alert("Error", "Gagal mengirim pesan: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      quality: 0.5,        
      maxWidth: 800,       
      maxHeight: 800,      
      includeBase64: true, 
    });

    if (result.didCancel) return;
    if (result.errorCode) {
      Alert.alert("Error", "Gagal mengambil gambar");
      return;
    }

    const asset = result.assets?.[0];
    
    if (asset?.base64) {
      setUploading(true);
      const imageHeader = `data:${asset.type || 'image/jpeg'};base64,`;
      const fullBase64Image = imageHeader + asset.base64;

      if (fullBase64Image.length > 1048487) { 
          Alert.alert("Gagal", "Gambar terlalu besar. Coba gambar lain.");
          setUploading(false);
          return;
      }

      await sendMessage(fullBase64Image);
      setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: MessageType }) => {
    const currentUser = mmkvStorage.getString('user.name') || auth.currentUser?.email || "Guest";
    const isMyMessage = item.user === currentUser;

    return (
      <View
        style={[
          styles.msgBox,
          isMyMessage ? styles.myMsg : styles.otherMsg,
        ]}
      >
        <Text style={styles.sender}>{item.user}</Text>
        
        {item.image && (
          <TouchableOpacity onPress={() => setSelectedImage(item.image!)}>
            <Image 
              source={{ uri: item.image }} 
              style={styles.chatImage} 
              resizeMode="cover"
            />
          </TouchableOpacity>
        )}

        {item.text ? <Text style={styles.msgText}>{item.text}</Text> : null}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        style={{ flex: 1 }}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.iconButton}>
          {uploading ? (
            <ActivityIndicator size="small" color="#007AFF" />
          ) : (
            <Icon name="plus" size={24} color="#007AFF" />
          )}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Ketik pesan..."
          value={message}
          onChangeText={setMessage}
        />
        
        <TouchableOpacity 
          onPress={() => sendMessage(null)} 
          style={[styles.iconButton, sending && styles.disabledButton]}
          disabled={sending}
        >
          <Icon name="send" size={24} color={sending ? "#ccc" : "#007AFF"} />
        </TouchableOpacity>
      </View>

      <Modal 
        visible={selectedImage !== null} 
        transparent={true} 
        animationType="fade"
        onRequestClose={() => setSelectedImage(null)}
      >
        <SafeAreaView style={styles.modalContainer}>
          <TouchableOpacity 
            style={styles.closeButtonContainer}
            onPress={() => setSelectedImage(null)}
          >
            <View style={styles.closeButton}>
              <Icon name="x" size={30} color="white" />
            </View>
          </TouchableOpacity>

          {selectedImage && (
            <Image 
              source={{ uri: selectedImage }} 
              style={styles.fullImage} 
              resizeMode="contain" 
            />
          )}
        </SafeAreaView>
      </Modal>
    </View>
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
    borderRadius: 10,
    maxWidth: "75%",
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
    marginBottom: 4,
    fontSize: 10,
    color: '#555',
    opacity: 0.8
  },
  msgText: {
    fontSize: 16,
    color: '#000',
  },
  chatImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginBottom: 5,
    backgroundColor: '#ddd'
  },
  inputRow: {
    flexDirection: "row",
    padding: 10,
    borderTopWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#fff",
    alignItems: 'center',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    marginHorizontal: 10,
    padding: 10,
    borderRadius: 20,
    backgroundColor: '#fafafa',
    height: 45
  },
  iconButton: {
    padding: 5,
  },
  disabledButton: {
    opacity: 0.5,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)', 
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonContainer: {
    position: 'absolute',
    top: 40, 
    right: 20,
    zIndex: 1, 
  },
  closeButton: {
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 20,
  },
  fullImage: {
    width: '100%',
    height: '80%', 
  }
});