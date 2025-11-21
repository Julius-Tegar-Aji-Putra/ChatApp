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
  Animated,
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
import NetInfo from "@react-native-community/netinfo";

type MessageType = {
  id: string;
  text: string;
  image?: string;
  user: string;
  createdAt: { seconds: number; nanoseconds: number } | null;
  pending?: boolean; // Penanda pesan belum terkirim
};

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<MessageType[]>([]);
  const headerTitleRef = useRef<string>("");
  // State untuk pesan yang menunggu koneksi (Offline)
  const [pendingMessages, setPendingMessages] = useState<MessageType[]>([]);
  
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  // State Status & Notifikasi
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [bannerText, setBannerText] = useState("Koneksi terputus");
  const [bannerColor, setBannerColor] = useState("#808080"); // Default Grey
  const fadeAnim = useRef(new Animated.Value(0)).current;
  // Ref untuk melacak status koneksi sebelumnya (biar gak muncul notif pas awal buka app)
  const wasOffline = useRef(false);
  
  
  const flatListRef = useRef<FlatList>(null);
  const name = headerTitleRef.current || route.params.name;

  // --- 1. HEADER ---
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: (props) => {
        if (props.children && typeof props.children === 'string') {
          headerTitleRef.current = props.children;
        }
        
        return (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>
              {props.children} 
            </Text>
            
            <View style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: isConnected ? '#007AFF' : '#808080',
              marginLeft: 8, 
              marginTop: 2,  
            }} />
          </View>
        );
      },
      headerRight: () => (
        <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
          <Icon name="log-out" size={24} color="#FF3B30" />
        </TouchableOpacity>
      ),
      headerBackVisible: false,
    });
  }, [navigation, isConnected]);

  // --- 2. FUNGSI HELPER NOTIFIKASI ---
  const showToast = (text: string, type: 'offline' | 'online') => {
    setBannerText(text);
    setBannerColor(type === 'offline' ? '#666666' : '#2196F3'); // Abu-abu / Biru
    
    // Animasi Masuk
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    // Auto hide setelah 3 detik
    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 3000);
  };

  // --- 3. DETEKSI INTERNET & SYNC ---
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected === true;
      setIsConnected(online);

      if (!online) {
        // Kasus: Online -> Offline
        wasOffline.current = true;
        showToast("Offline", "offline");
      } else {
        // Kasus: Offline -> Online
        if (wasOffline.current) {
          showToast("Kembali online", "online");
          wasOffline.current = false;
          
          // SYNC: Kirim pesan pending saat koneksi pulih
          if (pendingMessages.length > 0) {
             syncPendingMessages();
          }
        }
        // Jika awal buka app langsung online, tidak ada notifikasi (Sesuai request)
      }
    });
    return () => unsubscribe();
  }, [pendingMessages]); // Dependency pendingMessages agar sync bisa akses state terbaru

  const syncPendingMessages = async () => {
    console.log("Menyinkronkan pesan pending...");
    const queue = [...pendingMessages];
    // Kosongkan antrian lokal dulu (nanti akan masuk lagi via onSnapshot kalau sukses)
    setPendingMessages([]); 

    for (const msg of queue) {
        try {
            await addDoc(messagesCollection, {
                text: msg.text,
                image: msg.image || null,
                user: msg.user,
                createdAt: serverTimestamp(),
            });
            console.log("Pesan pending berhasil dikirim:", msg.text);
        } catch (error) {
            console.error("Gagal sync pesan:", error);
            // Jika gagal lagi, kembalikan ke queue (opsional, tapi aman)
        }
    }
  };

  // --- 4. HANDLE KEYBOARD ---
  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
        setKeyboardVisible(true);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    });

    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardVisible(false); 
    });

    return () => {
        keyboardDidShowListener.remove();
        keyboardDidHideListener.remove();
    };
  }, []);

  const handleLogout = () => {
    Alert.alert("Keluar", "Yakin ingin logout?", [
      { text: "Batal", style: "cancel" },
      {
        text: "Ya",
        style: "destructive",
        onPress: async () => {
            try {
                mmkvStorage.clearAll();
                await signOut(auth);
            } catch (e) {
                console.log("Logout error (mungkin offline):", e);
                // Tetap clear local storage
                mmkvStorage.clearAll();
            }
        },
      },
    ]);
  };

  // --- 5. LOGIKA DATA (LOAD & LISTEN) ---
  useEffect(() => {
    let isMounted = true;
    // A. Load MMKV dengan Error Handling
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
    loadLocalChat();

    // B. Listen Firebase
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

    // --- HANDLING OFFLINE ---
    if (isConnected === false) {
        const currentUser = mmkvStorage.getString('user.name') || auth.currentUser?.email || "Guest";
        
        // Buat pesan temporary
        const tempMsg: MessageType = {
            id: `temp_${Date.now()}`,
            text: message,
            image: imageUrl || undefined,
            user: currentUser,
            createdAt: null,
            pending: true // Tandai sebagai pending
        };

        // Tambahkan ke state pendingMessages
        setPendingMessages(prev => [...prev, tempMsg]);
        
        setMessage("");
        showToast("Pesan akan dikirim saat Anda kembali online", "offline");
        return; // Stop eksekusi, jangan coba kirim ke firebase dulu
    }

    // --- HANDLING ONLINE ---
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
       console.error("Send Error:", error);
       Alert.alert("Gagal", "Gagal mengirim pesan.");
    } finally {
      setSending(false);
    }
  };

  const pickImage = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo', quality: 0.5, maxWidth: 800, maxHeight: 800, includeBase64: true, 
    });

    if (result.didCancel || result.errorCode) return;

    const asset = result.assets?.[0];
    if (asset?.base64) {
      setUploading(true);
      const fullBase64 = `data:${asset.type || 'image/jpeg'};base64,${asset.base64}`;
      
      if (fullBase64.length > 1048487) { 
          Alert.alert("Gagal", "Gambar terlalu besar.");
          setUploading(false);
          return;
      }
      await sendMessage(fullBase64);
      setUploading(false);
    }
  };

  const renderItem = ({ item }: { item: MessageType }) => {
      const currentUser = mmkvStorage.getString('user.name') || auth.currentUser?.email || "Guest";
      const isMyMessage = item.user === currentUser;

      return (
        <View style={[
            styles.messageRow, 
            { justifyContent: isMyMessage ? 'flex-end' : 'flex-start' }
        ]}>
          
          {/* LOGIKA BARU: Ikon Pending ditaruh DI LUAR, SEBELUM BUBBLE */}
          {isMyMessage && item.pending && (
              <View style={styles.pendingIcon}>
                  <Icon name="clock" size={14} color="#999" />
              </View>
          )}

          {/* Bubble Chat (Style Kembali Normal) */}
          <View
            style={[
              styles.msgBox,
              isMyMessage ? styles.myMsg : styles.otherMsg,
            ]}
          >
            <Text style={styles.sender}>{item.user}</Text>
            
            {item.image && (
              <TouchableOpacity onPress={() => setSelectedImage(item.image!)}>
                <Image source={{ uri: item.image }} style={styles.chatImage} resizeMode="cover" />
              </TouchableOpacity>
            )}

            {item.text ? <Text style={styles.msgText}>{item.text}</Text> : null}
          </View>
        </View>
      );
    };

  // Gabungkan pesan server dan pesan pending untuk ditampilkan
  // Pesan pending ditaruh di paling bawah
  const displayedMessages = [...messages, ...pendingMessages];

  return (
    <View style={styles.container}>
      {/* --- CUSTOM FIXED HEADER (HANYA MUNCUL SAAT KEYBOARD AKTIF) --- */}
      {isKeyboardVisible && (
        <View style={styles.fixedHeaderWrapper}>
          <View style={styles.fixedHeaderContent}>
            {/* ✅ PAKAI headerTitle dari state (yang diambil dari props.children) */}
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#000' }}>
                {name}
              </Text>
              
              <View style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: isConnected ? '#007AFF' : '#808080',
                marginLeft: 8, 
                marginTop: 2,  
              }} />
            </View>

            {/* Logout Button */}
            <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
              <Icon name="log-out" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>
      )}
      
      {/* --- TOAST NOTIFICATION (PILL STYLE) --- */}
      <Animated.View style={[
          styles.toastContainer, 
          { opacity: fadeAnim, backgroundColor: bannerColor }
      ]}>
        <Text style={styles.toastText}>{bannerText}</Text>
      </Animated.View>

      <FlatList
        ref={flatListRef}
        data={displayedMessages} // Gunakan gabungan pesan
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        style={{ flex: 1 }}
      />

      <View style={styles.inputRow}>
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.iconButton}>
          {uploading ? <ActivityIndicator size="small" color="#007AFF" /> : <Icon name="plus" size={24} color="#007AFF" />}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Ketik pesan..."
          value={message}
          onChangeText={setMessage}
        />
        
        <TouchableOpacity onPress={() => sendMessage(null)} style={[styles.iconButton, sending && styles.disabledButton]} disabled={sending}>
          <Icon name="send" size={24} color={sending ? "#ccc" : "#007AFF"} />
        </TouchableOpacity>
      </View>

      <Modal visible={selectedImage !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedImage(null)}>
        <SafeAreaView style={styles.modalContainer}>
          <TouchableOpacity style={styles.closeButtonContainer} onPress={() => setSelectedImage(null)}>
            <View style={styles.closeButton}><Icon name="x" size={30} color="white" /></View>
          </TouchableOpacity>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullImage} resizeMode="contain" />}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f2' },
  fixedHeaderWrapper: {
    position: 'absolute',
    top: 0, // Posisi paling atas
    left: 0,
    right: 0,
    height: 292,
    zIndex: 9999, // Sangat tinggi agar di atas semua
    elevation: 20,
    backgroundColor: '#fff',
  },
  fixedHeaderContent: {
    position: 'absolute', 
    bottom: 0, 
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  toastContainer: {
    position: 'absolute',
    top: 20, // Muncul agak di bawah header
    alignSelf: 'center', // Tengah horizontal
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20, // Bentuk kapsul
    zIndex: 20,
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  toastText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  msgBox: { padding: 10, marginVertical: 6, borderRadius: 10, maxWidth: "75%" },
  myMsg: { backgroundColor: "#d1f0ff", alignSelf: "flex-end" },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 5 },
  pendingIcon: { marginRight: 5, marginBottom: 8},
  otherMsg: { backgroundColor: "#eee", alignSelf: "flex-start" },
  sender: { fontWeight: "bold", marginBottom: 4, fontSize: 10, color: '#555', opacity: 0.8 },
  msgText: { fontSize: 16, color: '#000' },
  pendingContainer: { position: 'absolute', bottom: 5, right: 5 },
  chatImage: { width: 200, height: 200, borderRadius: 8, marginBottom: 5, backgroundColor: '#ddd' },
  inputRow: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderColor: "#ccc", backgroundColor: "#fff", alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", marginHorizontal: 10, padding: 10, borderRadius: 20, backgroundColor: '#fafafa', height: 45 },
  iconButton: { padding: 5 },
  disabledButton: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeButtonContainer: { position: 'absolute', top: 40, right: 20, zIndex: 1 },
  closeButton: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  fullImage: { width: '100%', height: '80%' }
});