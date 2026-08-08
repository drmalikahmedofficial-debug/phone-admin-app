import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Vibration, Platform, StatusBar, Switch
} from 'react-native';
import { io } from 'socket.io-client';
import * as Device from 'expo-device';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

const C = {
  bg: '#0B0E17', card: '#141B2D', card2: '#1A2235',
  border: '#1E2D45', accent: '#3B82F6', green: '#22C55E',
  red: '#EF4444', yellow: '#F59E0B', text: '#E2E8F0', muted: '#64748B',
};

export default function App() {
  const [serverUrl, setServerUrl] = useState('http://192.168.1.1:3000');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [location, setLocation] = useState(null);
  const [autoReconnect, setAutoReconnect] = useState(true);
  const [activeTab, setActiveTab] = useState('home');
  const [permStatus, setPermStatus] = useState({ location: false, storage: false });
  const socketRef = useRef(null);

  useEffect(() => {
    checkPermissions();
    return () => { if (socketRef.current) socketRef.current.disconnect(); };
  }, []);

  const checkPermissions = async () => {
    const loc = await Location.getForegroundPermissionsAsync();
    const media = await MediaLibrary.getPermissionsAsync();
    setPermStatus({ location: loc.granted, storage: media.granted });
  };

  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('en-PK');
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  };

  const connect = () => {
    if (connected) { socketRef.current?.disconnect(); return; }
    if (!serverUrl.startsWith('http')) {
      Alert.alert('⚠️ Ghalat URL', 'URL http:// se shuru honi chahiye\nMisal: http://192.168.1.5:3000');
      return;
    }
    setConnecting(true);
    addLog(`🔄 Connect ho raha hai: ${serverUrl}`);
    const socket = io(serverUrl, {
      transports: ['websocket'], reconnection: autoReconnect,
      reconnectionAttempts: 10, timeout: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', async () => {
      setConnected(true); setConnecting(false);
      addLog('✅ Server se connect ho gaya!');
      socket.emit('phone:register', {
        model: Device.modelName || 'Unknown',
        brand: Device.brand || 'Unknown',
        androidVersion: Device.osVersion || 'Unknown',
        battery: 100,
      });
      startLocationTracking(socket);
    });

    socket.on('disconnect', (reason) => {
      setConnected(false); setConnecting(false);
      addLog(`❌ Disconnect: ${reason}`);
    });

    socket.on('reconnect', (attempt) => {
      setConnected(true);
      addLog(`🔄 Reconnected (attempt ${attempt})`);
    });

    socket.on('phone:command', async ({ command, data }) => {
      addLog(`📩 Command: ${command}`);
      await handleCommand(socket, command, data);
    });
  };

  const handleCommand = async (socket, command, data) => {
    switch (command) {
      case 'get_location':
        try {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          const locationData = { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: Math.round(loc.coords.accuracy) };
          setLocation(locationData);
          socket.emit('phone:location', locationData);
          addLog(`📍 Location bhaj di`);
        } catch (e) { addLog(`❌ Location error: ${e.message}`); }
        break;
      case 'ring':
        Vibration.vibrate([500, 200, 500, 200, 500]);
        Alert.alert('📱 Admin se Ring', 'Tumhara PC se ring kiya gaya!', [{ text: 'OK', onPress: () => Vibration.cancel() }]);
        addLog('🔔 Ring command execute hua');
        break;
      case 'vibrate':
        Vibration.vibrate(1000);
        addLog('📳 Vibrate ho gaya');
        break;
      case 'open_app':
        Alert.alert('App Open', `Admin ne ${data?.package} kholne ko kaha`);
        addLog(`📲 App open request: ${data?.package}`);
        break;
      default:
        addLog(`❓ Unknown command: ${command}`);
    }
  };

  const startLocationTracking = async (socket) => {
    try {
      const { granted } = await Location.getForegroundPermissionsAsync();
      if (!granted) return;
      const loc = await Location.getCurrentPositionAsync({});
      socket.emit('phone:location', { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: Math.round(loc.coords.accuracy) });
      addLog('📍 Initial location bhaj di');
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 50 },
        (loc) => {
          if (socket.connected) {
            socket.emit('phone:location', { lat: loc.coords.latitude, lng: loc.coords.longitude, accuracy: Math.round(loc.coords.accuracy) });
          }
        }
      );
    } catch (e) { addLog(`📍 Location error: ${e.message}`); }
  };

  const requestAllPermissions = async () => {
    addLog('⏳ Permissions maang rahe hain...');
    const loc = await Location.requestForegroundPermissionsAsync();
    if (loc.granted) addLog('✅ Location permission mili');
    await Location.requestBackgroundPermissionsAsync();
    const media = await MediaLibrary.requestPermissionsAsync();
    if (media.granted) addLog('✅ Storage permission mili');
    checkPermissions();
    Alert.alert('📋 Ek Kaam Baaki', 'Basic permissions mil gayi!\n\nSettings mein:\n1. Notification Access ON karo\n2. Accessibility Service ON karo', [{ text: 'OK' }]);
  };

  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={C.bg} barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📱 PhoneAdmin</Text>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: connected ? C.green : connecting ? C.yellow : C.red }]} />
          <Text style={[styles.statusText, { color: connected ? C.green : connecting ? C.yellow : C.red }]}>
            {connected ? 'Connected' : connecting ? 'Connecting...' : 'Offline'}
          </Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {['home', 'perms', 'logs'].map(tab => (
          <TouchableOpacity key={tab} style={[styles.tab, activeTab === tab && styles.tabActive]} onPress={() => setActiveTab(tab)}>
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'home' ? '🏠 Home' : tab === 'perms' ? '🔐 Perms' : '📋 Logs'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'home' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📱 Ye Phone</Text>
              <View style={styles.infoGrid}>
                <InfoItem label="Brand" value={Device.brand || '...'} />
                <InfoItem label="Model" value={Device.modelName || '...'} />
                <InfoItem label="Android" value={Device.osVersion || '...'} />
                <InfoItem label="Status" value={connected ? 'Online' : 'Offline'} color={connected ? C.green : C.red} />
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔗 PC se Connect Karo</Text>
              <Text style={styles.hint}>PC pe CMD mein `ipconfig` likh kar IPv4 Address lo</Text>
              <TextInput
                style={styles.input} value={serverUrl} onChangeText={setServerUrl}
                placeholder="http://192.168.1.5:3000" placeholderTextColor={C.muted}
                keyboardType="url" autoCapitalize="none" autoCorrect={false} editable={!connected}
              />
              <View style={styles.row}>
                <Text style={styles.hintSmall}>Auto Reconnect</Text>
                <Switch value={autoReconnect} onValueChange={setAutoReconnect} trackColor={{ false: C.border, true: C.accent }} thumbColor={C.text} />
              </View>
              <TouchableOpacity style={[styles.btn, { backgroundColor: connected ? C.red : connecting ? C.yellow : C.accent }]} onPress={connect} disabled={connecting}>
                <Text style={styles.btnText}>{connected ? '🔴 Disconnect' : connecting ? '⏳ Connecting...' : '🔗 Connect Karo'}</Text>
              </TouchableOpacity>
            </View>

            {location && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📍 Last Location</Text>
                <InfoItem label="Latitude" value={location.lat.toFixed(6)} />
                <InfoItem label="Longitude" value={location.lng.toFixed(6)} />
                <InfoItem label="Accuracy" value={`${location.accuracy}m`} />
              </View>
            )}

            <View style={styles.statusGrid}>
              <StatusCard icon="📍" label="Location" ok={permStatus.location} />
              <StatusCard icon="📁" label="Storage" ok={permStatus.storage} />
              <StatusCard icon="🔌" label="Backend" ok={connected} />
              <StatusCard icon="🔄" label="Auto Reconnect" ok={autoReconnect} />
            </View>
          </>
        )}

        {activeTab === 'perms' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>🔐 Permissions Setup</Text>
            <PermRow icon="📍" label="Location (hamesha)" desc="PC se phone ki location track karne ke liye" ok={permStatus.location} />
            <PermRow icon="📁" label="Storage / Media" desc="Phone ki files aur photos access karne ke liye" ok={permStatus.storage} />
            <PermRow icon="🔔" label="Notification Access" desc="Phone ki notifications PC pe bhejne ke liye" ok={false} manual={true} />
            <PermRow icon="♿" label="Accessibility Service" desc="Apps auto-open aur password fill karne ke liye" ok={false} manual={true} />
            <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 16 }]} onPress={requestAllPermissions}>
              <Text style={styles.btnText}>⚡ Sab Permissions Allow Karo</Text>
            </TouchableOpacity>
            <View style={styles.manualNote}>
              <Text style={styles.manualTitle}>⚠️ Manual Permissions (ek baar)</Text>
              <Text style={styles.manualText}>1. Settings {'>'} Apps {'>'} PhoneAdmin {'>'} Notifications: ON</Text>
              <Text style={styles.manualText}>2. Settings {'>'} Accessibility {'>'} PhoneAdmin: ON</Text>
            </View>
          </View>
        )}

        {activeTab === 'logs' && (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>📋 Activity Logs</Text>
              <TouchableOpacity onPress={() => setLogs([])}><Text style={{ color: C.red, fontSize: 12 }}>Clear</Text></TouchableOpacity>
            </View>
            {logs.length === 0 && <Text style={styles.emptyText}>Abhi koi activity nahi...</Text>}
            {logs.map((log, i) => <Text key={i} style={styles.logLine}>{log}</Text>)}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function InfoItem({ label, value, color }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, color && { color }]}>{value}</Text>
    </View>
  );
}

function StatusCard({ icon, label, ok }) {
  return (
    <View style={[styles.statusCard, { borderColor: ok ? 'rgba(34,197,94,0.3)' : '#1E2D45' }]}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={{ fontSize: 10, color: ok ? '#22C55E' : '#EF4444', fontWeight: '600' }}>{ok ? '✅ ON' : '❌ OFF'}</Text>
    </View>
  );
}

function PermRow({ icon, label, desc, ok, manual }) {
  return (
    <View style={styles.permRow}>
      <View style={styles.permLeft}>
        <Text style={{ fontSize: 20 }}>{icon}</Text>
        <View style={{ flex: 1, marginLeft: 10 }}>
          <Text style={styles.permLabel}>{label}</Text>
          <Text style={styles.permDesc}>{desc}</Text>
          {manual && <Text style={{ fontSize: 10, color: '#F59E0B', marginTop: 2 }}>⚠️ Manually ON karna hai Settings mein</Text>}
        </View>
      </View>
      <Text style={{ color: ok ? '#22C55E' : '#EF4444', fontWeight: '700', fontSize: 12 }}>{ok ? '✅' : '❌'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B0E17' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 12, backgroundColor: '#0F1520', borderBottomWidth: 1, borderBottomColor: '#1E2D45' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#3B82F6' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },
  tabs: { flexDirection: 'row', backgroundColor: '#0F1520', borderBottomWidth: 1, borderBottomColor: '#1E2D45' },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: '#3B82F6' },
  tabText: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  tabTextActive: { color: '#3B82F6' },
  content: { flex: 1, padding: 14 },
  card: { backgroundColor: '#141B2D', borderWidth: 1, borderColor: '#1E2D45', borderRadius: 12, padding: 16, marginBottom: 14 },
  cardTitle: { fontSize: 11, fontWeight: '700', color: '#64748B', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: { flex: 1, minWidth: '45%', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 10 },
  infoLabel: { fontSize: 10, color: '#64748B', marginBottom: 3 },
  infoValue: { fontSize: 13, fontWeight: '600', color: '#E2E8F0' },
  hint: { fontSize: 11, color: '#64748B', marginBottom: 10, lineHeight: 16 },
  hintSmall: { fontSize: 12, color: '#64748B' },
  input: { backgroundColor: '#1A2235', borderWidth: 1, borderColor: '#1E2D45', borderRadius: 8, padding: 11, color: '#E2E8F0', fontSize: 13, marginBottom: 10, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  btn: { padding: 13, borderRadius: 9, alignItems: 'center', marginTop: 4 },
  btnText: { color: 'white', fontWeight: '700', fontSize: 14 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statusCard: { flex: 1, minWidth: '44%', backgroundColor: '#141B2D', borderWidth: 1, borderRadius: 10, padding: 14, alignItems: 'center', gap: 6 },
  statusLabel: { fontSize: 11, color: '#64748B', fontWeight: '500' },
  permRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1E2D45' },
  permLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  permLabel: { fontSize: 13, fontWeight: '600', color: '#E2E8F0' },
  permDesc: { fontSize: 11, color: '#64748B', marginTop: 2, lineHeight: 15 },
  manualNote: { backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1, borderColor: 'rgba(245,158,11,0.2)', borderRadius: 8, padding: 12, marginTop: 12 },
  manualTitle: { fontSize: 12, fontWeight: '700', color: '#F59E0B', marginBottom: 6 },
  manualText: { fontSize: 11, color: '#E2E8F0', marginBottom: 3, lineHeight: 16 },
  logLine: { fontSize: 11, color: '#64748B', marginBottom: 4, lineHeight: 16, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  emptyText: { fontSize: 13, color: '#64748B', textAlign: 'center', paddingVertical: 20 },
});
