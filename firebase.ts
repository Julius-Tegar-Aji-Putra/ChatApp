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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
} from "firebase/auth";

// Konfigurasi Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDTBjYGmIPgXG9DDgSp7-gGrCrZaVRSPys",
  authDomain: "chatapp-83b63.firebaseapp.com",
  projectId: "chatapp-83b63",
  storageBucket: "chatapp-83b63.firebasestorage.app",
  messagingSenderId: "780228503102",
  appId: "1:780228503102:web:f1e490d3b43ae0f76bd36f",
  measurementId: "G-0N3FQW7Z64"
};

// Inisialisasi Firebase
const app = initializeApp(firebaseConfig);

// Siapkan Auth dan Database
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
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut
};