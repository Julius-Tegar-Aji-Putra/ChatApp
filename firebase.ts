import { initializeApp } from "firebase/app";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  CollectionReference,
  DocumentData,
} from "firebase/firestore";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged,
} from "firebase/auth";

// Konfigurasi Firebase kamu (ambil dari konsol Firebase)
const firebaseConfig = {
  apiKey: "API_KEY",
  authDomain: "AUTH_DOMAIN",
  projectId: "PROJECT_ID",
  storageBucket: "STORAGE_BUCKET",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Referensi ke koleksi 'messages' di Firestore
export const messagesCollection = collection(db, "messages") as CollectionReference<DocumentData>;

// Ekspor semua fungsi yang akan dipakai di aplikasi
export {
  auth,
  db,
  collection,
  addDoc,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  signInAnonymously,
  onAuthStateChanged,
};