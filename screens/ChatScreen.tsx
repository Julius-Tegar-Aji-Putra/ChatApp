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
  BackHandler,
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

const generateUniqueId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
};

const getDateFromTimestamp = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp.toDate) return timestamp.toDate(); 
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000); 
  return new Date(timestamp); 
};

const formatTime = (timestamp: any) => {
  const date = getDateFromTimestamp(timestamp);
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
};

const formatDatePill = (timestamp: any) => {
  const date = getDateFromTimestamp(timestamp);
  const now = new Date();
  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString()) {
    return "Hari Ini";
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return "Kemarin";
  }
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

type MessageType = {
  id: string;
  text: string;
  image?: string;
  user: string;
  createdAt: any;
  pending?: boolean;
  clientMessageId?: string;
};

type Props = NativeStackScreenProps<RootStackParamList, "Chat">;

export default function ChatScreen({ route, navigation }: Props) {
  const [message, setMessage] = useState<string>("");
  const [messages, setMessages] = useState<MessageType[]>([]);
  const headerTitleRef = useRef<string>("");
  const [pendingMessages, setPendingMessages] = useState<MessageType[]>([]);
  const isFirstLoad = useRef(true);
  const [uploading, setUploading] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [bannerText, setBannerText] = useState("Koneksi terputus");
  const [bannerColor, setBannerColor] = useState("#808080"); 
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const wasOffline = useRef(false); 
  const flatListRef = useRef<FlatList>(null);
  const name = headerTitleRef.current || route.params.name;

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

  const showToast = (text: string, type: 'offline' | 'online') => {
    setBannerText(text);
    setBannerColor(type === 'offline' ? '#666666' : '#2196F3');
  
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();

    setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }).start();
    }, 3000);
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = state.isConnected === true;
      setIsConnected(online);

      if (!online) {
        wasOffline.current = true;
        showToast("Offline", "offline");
      } else {
        if (wasOffline.current) {
          showToast("Kembali online", "online");
          wasOffline.current = false;
          if (pendingMessages.length > 0) {
             syncPendingMessages();
          }
        }
      }
    });
    return () => unsubscribe();
  }, [pendingMessages]); 

  const syncPendingMessages = async () => {
    const queueString = mmkvStorage.getString('offline_queue');
    if (!queueString) return;

    const queue: MessageType[] = JSON.parse(queueString);
    if (queue.length === 0) return;

    console.log(`[SYNC] Mengirim ${queue.length} pesan pending...`);
    showToast("Mengirim pesan tertunda...", "online");

    const remainingQueue: MessageType[] = [];

    for (const msg of queue) {
        try {
            await addDoc(messagesCollection, {
                text: msg.text,
                image: msg.image || null,
                user: msg.user,
                createdAt: serverTimestamp(), 
                clientMessageId: msg.clientMessageId || generateUniqueId(), 
            });
            console.log("Sukses kirim:", msg.text);
        } catch (error) {
            console.log("Gagal kirim, simpan balik ke queue:", error);
            remainingQueue.push(msg); 
        }
    }

    setPendingMessages(remainingQueue);
    if (remainingQueue.length > 0) {
        mmkvStorage.set('offline_queue', JSON.stringify(remainingQueue));
    } else {
        mmkvStorage.remove('offline_queue'); 
        showToast("Semua pesan terkirim", "online");
    }
  };

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
        setKeyboardVisible(true);
    });

    const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
        setKeyboardVisible(false);
    });

    const backHandler = BackHandler.addEventListener("hardwareBackPress", () => {
      if (isKeyboardVisible) {
        setKeyboardVisible(false);
        Keyboard.dismiss();
        return true;
      }
      return false;
    });

    return () => {
        keyboardDidShowListener.remove();
        keyboardDidHideListener.remove();
        backHandler.remove();
    };
  }, [isKeyboardVisible]);

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
                mmkvStorage.clearAll();
            }
        },
      },
    ]);
  };

  useEffect(() => {
    let isMounted = true;
    const loadLocalChat = () => {
      const savedChat = mmkvStorage.getString('chat_history');
      if (savedChat) {
        try {
          const parsedChat = JSON.parse(savedChat);
          console.log(`[OFFLINE] Memuat ${parsedChat.length} pesan dari MMKV.`);
          if (isMounted) {
             setMessages(parsedChat);
          }
        } catch (e) {
          console.log("[OFFLINE] Gagal parse chat local:", e);
        }
      } else {
        console.log("[OFFLINE] Tidak ada data chat di MMKV.");
      }
    };
    loadLocalChat();

    const loadQueue = () => {
      const savedQueue = mmkvStorage.getString('offline_queue');
      if (savedQueue) {
        try {
          const parsedQueue = JSON.parse(savedQueue);
          console.log(`[OFFLINE] Memuat ${parsedQueue.length} pesan antrian.`);
          if (isMounted) setPendingMessages(parsedQueue);
        } catch (e) { console.log("Error parse queue:", e); }
      }
    };
    loadQueue();

    const q = query(messagesCollection, orderBy("createdAt", "asc"));
   
    const unsub = onSnapshot(q, { includeMetadataChanges: true },
      (snapshot: QuerySnapshot) => {
      if (!isMounted) return;

      const source = snapshot.metadata.fromCache ? "local cache" : "server";
      console.log(`[ONLINE] Snapshot update dari ${source}. Jumlah docs: ${snapshot.docs.length}`);

      if (snapshot.empty) {
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

      setMessages(list);
      if (list.length > 0) {
          try {
              mmkvStorage.set('chat_history', JSON.stringify(list));
              console.log("[SYNC] Chat tersimpan ke MMKV.");
          } catch (e) {
              console.log("MMKV Write Error:", e);
          }
        }
 
      if (isAtBottom) {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
      } else {
          console.log("Ada pesan baru, tapi user sedang di atas. Tidak scroll.");
      }

    }, (error) => {
        if (error.code === 'unavailable' || error.message.includes('offline')) {
            console.log("Tidak bisa terkoneksi dengan firebase - OFFLINE");
        } else {
            console.log("Firestore Error:", error.message);
        loadLocalChat();
        }
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, []);

  const sendMessage = async (imageUrl: string | null = null) => {
    const textToSend = message;

    if (!textToSend.trim() && !imageUrl) return;
    if (sending) return;

    setMessage("");

    const currentUser = mmkvStorage.getString('user.name') || auth.currentUser?.email || "Guest";
    const tempId = generateUniqueId();

    if (isConnected === false) {        
        const tempMsg: MessageType = {
            id: `temp_${tempId}`, 
            text: textToSend,
            image: imageUrl || undefined,
            user: currentUser,
            createdAt: Date.now(), 
            pending: true,
            clientMessageId: tempId, 
        };

        const newPendingList = [...pendingMessages, tempMsg];
        setPendingMessages(newPendingList);

        mmkvStorage.set('offline_queue', JSON.stringify(newPendingList));
       
        showToast("Pesan akan dikirim saat Anda kembali online", "offline");
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 400);
        return; 
    }

    setSending(true);
    try {
      await addDoc(messagesCollection, {
        text: textToSend,
        image: imageUrl,
        user: currentUser,
        createdAt: serverTimestamp(),
        clientMessageId: tempId,
      });
    } catch (error: any) {
       console.log("Send Error:", error);
       showToast("Jaringan lambat. Disimpan ke antrian.", "offline");
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

  const handleScroll = (event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    const isCloseToBottom = distanceFromBottom < 50;
    console.log("isAtBottom: ", isCloseToBottom);
   
    setIsAtBottom(isCloseToBottom);
  };

  const displayedMessages = [...messages, ...pendingMessages];

  const renderItem = ({ item, index }: { item: MessageType, index: number }) => {
      const currentUser = mmkvStorage.getString('user.name') || auth.currentUser?.email || "Guest";
      const isMyMessage = item.user === currentUser;
      const showDatePill = () => {
        if (index === 0) return true; 
       
        const prevMsg = displayedMessages[index - 1];
        const currentDate = getDateFromTimestamp(item.createdAt).toDateString();
        const prevDate = getDateFromTimestamp(prevMsg.createdAt).toDateString();

        return currentDate !== prevDate; 
      };

      return (
        <View>
          {/* RENDER DATE PILL */}
          {showDatePill() && (
            <View style={styles.datePill}>
              <Text style={styles.datePillText}>{formatDatePill(item.createdAt)}</Text>
            </View>
          )}

          {/* MESSAGE ROW */}
          <View style={[
              styles.messageRow,
              { justifyContent: isMyMessage ? 'flex-end' : 'flex-start' }
          ]}>
           
            {/* Ikon Pending (Offline) */}
            {isMyMessage && item.pending && (
                <View style={styles.pendingIcon}>
                    <Icon name="clock" size={12} color="#777" />
                </View>
            )}

            {/* Bubble Chat */}
            <View
              style={[
                styles.msgBox,
                isMyMessage ? styles.myMsg : styles.otherMsg,
              ]}
            >
              {!isMyMessage && <Text style={styles.sender}>{item.user}</Text>}
             
              {item.image && (
                <TouchableOpacity onPress={() => setSelectedImage(item.image!)}>
                  <Image source={{ uri: item.image }} style={styles.chatImage} resizeMode="cover" />
                </TouchableOpacity>
              )}

              {item.text ? <Text style={styles.msgText}>{item.text}</Text> : null}

              {/* TIMESTAMP DI DALAM BUBBLE */}
              <View style={styles.timeContainer}>
                 <Text style={styles.timeText}>
                    {formatTime(item.createdAt)}
                    {isMyMessage && !item.pending && (
                       <Text> <Icon name="check" size={10} color="#555" /></Text>
                    )}
                 </Text>
              </View>
            </View>
          </View>
        </View>
      );
    };

  return (
    <View style={styles.container}>
      {isKeyboardVisible && (
        <View style={styles.fixedHeaderWrapper}>
          <View style={styles.fixedHeaderContent}>
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
            <TouchableOpacity onPress={handleLogout} style={{ marginRight: 10 }}>
              <Icon name="log-out" size={24} color="#FF3B30" />
            </TouchableOpacity>
          </View>
        </View>
      )}

      {!isAtBottom && (
        <TouchableOpacity 
          style={styles.scrollToBottomButton}
          onPress={() => {
            flatListRef.current?.scrollToEnd({ animated: true });
          }}
        >
          <Icon name="arrow-down" size={24} color="#007AFF" />
        </TouchableOpacity>
      )}
     
      <Animated.View style={[
          styles.toastContainer,
          { opacity: fadeAnim, backgroundColor: bannerColor }
      ]}>
        <Text style={styles.toastText}>{bannerText}</Text>
      </Animated.View>

      <FlatList
        ref={flatListRef}
        data={displayedMessages} 
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        style={{ flex: 1 }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        onContentSizeChange={() => {
            if (isFirstLoad.current && displayedMessages.length > 0) {
                flatListRef.current?.scrollToEnd({ animated: false });

                setTimeout(() => {
                    isFirstLoad.current = false;
                }, 15000);
            } 
            
            else if (isAtBottom) {
                flatListRef.current?.scrollToEnd({ animated: true });
            }
        }}
               
       
        onLayout={() => {
          if (isFirstLoad.current && displayedMessages.length > 0) {
            setTimeout(() => {
              flatListRef.current?.scrollToEnd({ animated: false });
            }, 500); 
          }
        }}
        onScrollBeginDrag={() => {
          isFirstLoad.current = false;
           if (isKeyboardVisible) {
             setKeyboardVisible(false); 
             Keyboard.dismiss(); 
           }
        }}
        keyboardDismissMode="on-drag"

      />

      <View style={styles.inputRow}>
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.iconButton}>
          {uploading ? <ActivityIndicator size="small" color="#007AFF" /> : <Icon name="plus" size={24} color="#007AFF" />}
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Ketik pesan..."
          placeholderTextColor="#888888"
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
    top: 0, 
    left: 0,
    right: 0,
    height: 292,
    zIndex: 9999, 
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
    top: 20, 
    alignSelf: 'center', 
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20, 
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
  msgBox: {
    padding: 10,
    paddingBottom: 6, 
    marginVertical: 4,
    borderRadius: 12,
    maxWidth: "75%",
    minWidth: 80, 
  },
  myMsg: { backgroundColor: "#d1f0ff", alignSelf: "flex-end" },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 5 },
  pendingIcon: { marginRight: 5, marginBottom: 8},
  otherMsg: { backgroundColor: "#eee", alignSelf: "flex-start" },
  sender: { fontWeight: "bold", marginBottom: 4, fontSize: 10, color: '#555', opacity: 0.8 },
  msgText: { fontSize: 16, color: '#000' },
  pendingContainer: { position: 'absolute', bottom: 5, right: 5 },
  chatImage: { width: 200, height: 200, borderRadius: 8, marginBottom: 5, backgroundColor: '#ddd' },
  inputRow: { flexDirection: "row", padding: 10, borderTopWidth: 1, borderColor: "#ccc", backgroundColor: "#fff", alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderColor: "#ccc", marginHorizontal: 10, padding: 10, borderRadius: 20, backgroundColor: '#fafafa', height: 45, color: '#000000' },
  iconButton: { padding: 5 },
  disabledButton: { opacity: 0.5 },
  modalContainer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center' },
  closeButtonContainer: { position: 'absolute', top: 40, right: 20, zIndex: 1 },
  closeButton: { padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  fullImage: { width: '100%', height: '80%' },
  datePill: {
    alignSelf: 'center',
    backgroundColor: '#e0e0e0',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 10,
    opacity: 0.8,
  },
  datePillText: {
    fontSize: 11,
    fontWeight: 'bold',
    color: '#555',
  },
  timeContainer: {
    alignSelf: 'flex-end', 
    marginTop: 4,
    marginLeft: 8,
  },
  timeText: {
    fontSize: 10,
    color: '#555', 
    opacity: 0.7,
  },
 scrollToBottomButton: {
    position: 'absolute',
    bottom: 80,
    right: 7,
    width: 40,
    height: 40,
    borderRadius: 25,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    zIndex: 10,
},
});