import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ActivityIndicator, 
  Alert 
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../App';
import { auth, signInWithEmailAndPassword, signInAnonymously } from '../firebase';
import { storage } from '../utils/storage';
import Icon from 'react-native-vector-icons/Feather';

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export default function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  
  // State untuk Show/Hide Password
  const [isPasswordHidden, setPasswordHidden] = useState(true);

  const [isLoginLoading, setLoginLoading] = useState(false);
  const [isGuestLoading, setGuestLoading] = useState(false);

  // --- 1. FUNGSI LOGIN EMAIL ---
  const handleLogin = async () => {
    if (email === '' || password === '') {
      Alert.alert('Error', 'Email dan password tidak boleh kosong.');
      return;
    }
    setLoginLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      
      // Simpan ke MMKV
      storage.set('user.uid', user.uid);
      if (user.email) storage.set('user.email', user.email);
      
      // KUNCI PERBAIKAN: Ambil nama dari profil (jika register pakai nama) atau pakai email
      const displayName = user.displayName || user.email || "User";
      storage.set('user.name', displayName);
      
      // Navigasi otomatis dihandle oleh App.tsx

    } catch (error: any) {
      Alert.alert('Login Gagal', 'Email atau password salah.');
    } finally {
      setLoginLoading(false);
    }
  };

  // --- 2. FUNGSI LOGIN GUEST ---
  const handleGuestLogin = async () => {
    setGuestLoading(true);
    
    try {
      const userCredential = await signInAnonymously(auth);
      const user = userCredential.user;
      
      // Simpan UID
      storage.set('user.uid', user.uid);
      // PENTING: Set manual nama 'Guest' di MMKV
      storage.set('user.name', 'Guest');
      
    } catch (error: any) {
      Alert.alert('Guest Login Gagal', error.message);
    } finally {
      setGuestLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selamat Datang!</Text>
      <Text style={styles.subtitle}>Login untuk melanjutkan</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#888"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      
      {/* Input Password dengan Icon Mata */}
      <View style={styles.passwordContainer}>
        <TextInput
          style={styles.inputPassword}
          placeholder="Password"
          placeholderTextColor="#888"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={isPasswordHidden}
        />
        <TouchableOpacity onPress={() => setPasswordHidden(!isPasswordHidden)}>
          <Icon name={isPasswordHidden ? 'eye-off' : 'eye'} size={24} color="grey" />
        </TouchableOpacity>
      </View>

      {/* Tombol Login */}
      <TouchableOpacity 
        style={styles.button} 
        onPress={handleLogin} 
        disabled={isLoginLoading || isGuestLoading} 
      >
        {isLoginLoading ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <Text style={styles.buttonText}>Login</Text>
        )}
      </TouchableOpacity>

      {/* Link ke Register */}
      <View style={styles.registerContainer}>
        <Text style={styles.registerText}>Belum punya akun? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('Register')}>
          <Text style={styles.registerLink}>Daftar Sekarang</Text>
        </TouchableOpacity>
      </View>

      {/* Pemisah */}
      <View style={{height: 1, backgroundColor: '#ccc', width: '80%', marginVertical: 20}} />

      {/* Tombol Guest */}
      <TouchableOpacity 
        style={[styles.button, styles.guestButton]} 
        onPress={handleGuestLogin}
        disabled={isLoginLoading || isGuestLoading}
      >
        {isGuestLoading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
            <Text style={styles.buttonText}>Masuk sebagai Guest (Tamu)</Text>
        )}
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000000',
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#888',
    textAlign: 'center',
    marginBottom: 30,
  },
  input: {
    width: '100%',
    height: 50,
    backgroundColor: '#F7F7F7',
    borderColor: '#E8E8E8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
    fontSize: 16,
    color: '#000',
  },
  passwordContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    height: 50,
    backgroundColor: '#F7F7F7',
    borderColor: '#E8E8E8',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    marginBottom: 15,
  },
  inputPassword: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    height: '100%',
  },
  button: {
    width: '100%',
    height: 50,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  guestButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  registerContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 20,
  },
  registerText: {
    fontSize: 14,
    color: '#888',
  },
  registerLink: {
    fontSize: 14,
    color: '#007AFF',
    fontWeight: 'bold',
  },
});