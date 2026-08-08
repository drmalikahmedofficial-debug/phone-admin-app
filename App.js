import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ScrollView, Alert, Vibration, Platform, StatusBar,
  AppState, Switch
} from 'react-native';
import { io } from 'socket.io-client';
import * as Device from 'expo-device';
import * as Battery from 'expo-battery';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

// =====================
//  COLORS
// =====================
const C = {
  bg: '#0B0E17',
  card: '#141B2D',
  card2: '#1A2235',
  border: '#1E2D45',
  accent: '#3B82F6',
  green: '#22C55E',
  red: '#EF4444',
  yellow: '#F59E0B',
  text: '#E2E8F0',
  muted: '#64748B',
};

// =====================
//  MAIN APP
// =====================
export default function App() {
  const [serverUrl, setServerUrl] = useState('http://192.168.1.1:3000');
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [logs, setLogs] = useState([]);
  const [deviceInfo, setDeviceInfo] = useState(null);
  const [battery, setBattery] = useState(0);
  const [location, setLocation] = useState(null);
  const [permStatus, setPermStatus] = useState({
    location: false,
    storage: false,
    notifications: false,
  });
  const [activeTab, setActiveTab] = useState('home');
  const [autoReconnect, setAutoReconnect] = useState(true);
  const socketRef = useRef(null);
  const appState = useRef(AppState.currentState);

  // ---- Init ----
  useEffect(() => {
    getDeviceInfo();
    checkPermissions();
    setupAppStateListener();
    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // ---- Battery Updates ----
  useEffect(() => {
    const sub = Battery.addBatteryLevelListener(({ batteryLevel }) => {
      const pct = Math.round(batteryLevel * 100);
      setBattery(pct);
      if (socketRef.current?.connected) {
        socketRef.current.emit('phone:battery', pct);
      }
    });
    return () => sub.remove();
  }, []);

  // ---- Background / Foreground ----
  const setupAppStateListener = () => {
    AppState.addEventListener('change', (nextState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextState === 'active' &&
        autoReconnect &&
        !connected
      ) {
        addLog('App foreground mein aaya, reconnect...');
        // Auto reconnect
      }
      appState.current = nextState;
    });
  };

  // ---- Device Info ----
  const getDeviceInfo = async () => {
    const bat = await Battery.getBatteryLevelAsync();
    const pct = Math.round(bat * 100);
    setBattery(pct);

    const info = {
      model: Device.modelName || 'Unknown Model',
      brand: Device.brand || 'Unknown Brand',
      androidVersion: Device.osVersion || 'Unknown',
      battery: pct,
      osName: Device.osName,
      deviceType: Device.deviceType,
    };
    setDeviceInfo(info);
    addLog(`📱 Device: ${info.brand} ${info.model}`);
  };

  // ---- Permissions ----
  const checkPermissions = async () => {
    const loc = await Location.getForegroundPermissionsAsync();
    const media = await MediaLibrary.getPermissionsAsync();
    setPermStatus(prev => ({
      ...prev,
      location: loc.granted,
      storage: media.granted,
    }));
  };

  const requestAllPermissions = async () => {
    addLog('⏳ Permissions maang rahe hain...');

    // Location
    const loc = await Location.requestForegroundPermissionsAsync();
    if (loc.granted) {
      addLog('✅ Location permission mili');
    } else {
      addLog('❌ Location permission nahi mili');
    }

    // Background Location
    await Location.requestBackgroundPermissionsAsync();

    // Storage/Media
    const media = await MediaLibrary.requestPermissionsAsync();
    if (media.granted) {
      addLog('✅ Storage permission mili');
    } else {
      addLog('❌ Storage permission nahi mili');
    }

    checkPermissions();
    addLog('⚠️ Notifications ke liye: Settings > Apps > PhoneAdmin > Notifications ON karo');
    Alert.alert(
      '📋 Ek Kaam Baaki Hai',
      'Basic permissions mil gayi hain!\n\nAbhi jaake Settings mein:\n1. Notification Access ON karo\n2. Accessibility Service ON karo\n\n(Ye ek baar karna hai)',
      [{ text: 'Theek Hai', style: 'default' }]
    );
  };

  // ---- Connect to Backend ----
  const connect = () => {
    if (connected) {
      socketRef.current?.disconnect();
      return;
    }

    if (!serverUrl.startsWith('http')) {
      Alert.alert('⚠️ Ghalat URL', 'URL http:// se shuru honi chahiye\nMisal: http://192.168.1.5:3000');
      return;
    }

    setConnecting(true);
    addLog(`🔄 Connect ho raha hai: ${serverUrl}`);

    const socket = io(serverUrl, {
      transports: ['websocket'],
      reconnection: autoReconnect,
      reconnectionAttempts: 10,
      timeout: 10000,
    });

    socketRef.current = socket;

    // ---- Connect ----
    socket.on('connect', async () => {
      setConnected(true);
      setConnecting(false);
      addLog('✅ Server se connect ho gaya!');

      // Register phone
      const bat = await Battery.getBatteryLevelAsync();
      socket.emit('phone:register', {
        model: deviceInfo?.model || Device.modelName || 'Unknown',
        brand: deviceInfo?.brand || Device.brand || 'Unknown',
        androidVersion: deviceInfo?.androidVersion || Device.osVersion || 'Unknown',
        battery: Math.round(bat * 100),
      });

      // Start location tracking
      startLocationTracking(socket);
    });

    // ---- Disconnect ----
    socket.on('disconnect', (reason) => {
      setConnected(false);
      setConnecting(false);
      addLog(`❌ Disconnect: ${reason}`);
    });

    // ---- Reconnect ----
    socket.on('reconnect', (attempt) => {
      addLog(`🔄 Reconnected (attempt ${attempt})`);
      setConnected(true);
    });

    // ---- Commands from Admin ----
    socket.on('phone:command', async ({ command, data }) => {
      addLog(`📩 Command: ${command}`);
      await handleCommand(socket, command, data);
    });
  };

  // ---- Handle Admin Commands ----
  const handleCommand = async (socket, command, data) => {
    switch (command) {

      case 'screenshot':
        addLog('📷 Screenshot feature (native app mein available hoga)');
        socket.emit('phone:screenshot', null);
        break;

      case 'get_location':
        try {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.High
          });
          const locationData = {
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
            accuracy: Math.round(loc.coords.accuracy),
          };
          setLocation(locationData);
          socket.emit('phone:location', locationData);
          addLog(`📍 Location bhaj di: ${locationData.lat.toFixed(4)}, ${locationData.lng.toFixed(4)}`);
        } catch (e) {
          addLog(`❌ Location error: ${e.message}`);
        }
        break;

      case 'get_battery':
        const bat = await Battery.getBatteryLevelAsync();
        const pct = Math.round(bat * 100);
        socket.emit('phone:battery', pct);
        addLog(`🔋 Battery bhej di: ${pct}%`);
        break;

      case 'ring':
        Vibration.vibrate([500, 200, 500, 200, 500]);
        Alert.alert('📱 Admin se Ring', 'Tumhara PC se ring kiya gaya hai!', [
          { text: 'OK', onPress: () => Vibration.cancel() }
        ]);
        addLog('🔔 Ring command execute hua');
        break;

      case 'vibrate':
        Vibration.vibrate(1000);
        addLog('📳 Vibrate ho gaya');
        break;

      case 'flashlight_on':
        addLog('🔦 Flashlight ON (native build mein kaam karega)');
        break;

      case 'flashlight_off':
        addLog('💡 Flashlight OFF (native build mein kaam karega)');
        break;

      case 'open_app':
        addLog(`📲 App kholne ki request: ${data?.package || 'unknown'}`);
        Alert.alert('App Open', `Admin ne ${data?.package} kholne ko kaha`);
        break;

      default:
        addLog(`❓ Unknown command: ${command}`);
    }
  };

  // ---- Location Tracking ----
  const startLocationTracking = async (socket) => {
    try {
      const { granted } = await Location.getForegroundPermissionsAsync();
      if (!granted) return;

      // Send initial location
      const loc = await Location.getCurrentPositionAsync({});
      socket.emit('phone:location', {
        lat: loc.coords.latitude,
        lng: loc.coords.longitude,
        accuracy: Math.round(loc.coords.accuracy),
      });
      addLog('📍 Initial location bhaj di');

      // Watch location changes
      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 30000, distanceInterval: 50 },
        (loc) => {
          if (socket.connected) {
            socket.emit('phone:location', {
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              accuracy: Math.round(loc.coords.accuracy),
            });
          }
        }
      );
    } catch (e) {
      addLog(`📍 Location tracking error: ${e.message}`);
    }
  };

  // ---- Logs ----
  const addLog = (msg) => {
    const time = new Date().toLocaleTimeString('en-PK');
    setLogs(prev => [`[${time}] ${msg}`, ...prev].slice(0, 100));
  };

  // ---- UI ----
  return (
    <View style={styles.container}>
      <StatusBar backgroundColor={C.bg} barStyle="light-content" />

      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📱 PhoneAdmin</Text>
        <View style={styles.headerRight}>
          <View style={[styles.statusDot, { backgroundColor: connected ? C.green : connecting ? C.yellow : C.red }]} />
          <Text style={[styles.statusText, { color: connected ? C.green : connecting ? C.yellow : C.red }]}>
            {connected ? 'Connected' : connecting ? 'Connecting...' : 'Offline'}
          </Text>
        </View>
      </View>

      {/* TABS */}
      <View style={styles.tabs}>
        {['home', 'perms', 'logs'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'home' ? '🏠 Home' : tab === 'perms' ? '🔐 Perms' : '📋 Logs'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>

        {/* ---- HOME TAB ---- */}
        {activeTab === 'home' && (
          <>
            {/* Device Info */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📱 Ye Phone</Text>
              <View style={styles.infoGrid}>
                <InfoItem label="Brand" value={deviceInfo?.brand || '...'} />
                <InfoItem label="Model" value={deviceInfo?.model || '...'} />
                <InfoItem label="Android" value={deviceInfo?.androidVersion || '...'} />
                <InfoItem label="Battery" value={`${battery}%`} color={battery > 60 ? C.green : battery > 20 ? C.yellow : C.red} />
              </View>
            </View>

            {/* Server Connection */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔗 PC se Connect Karo</Text>
              <Text style={styles.hint}>PC pe CMD mein `ipconfig` likh kar IPv4 Address lo</Text>
              <TextInput
                style={styles.input}
                value={serverUrl}
                onChangeText={setServerUrl}
                placeholder="http://192.168.1.5:3000"
                placeholderTextColor={C.muted}
                keyboardType="url"
                autoCapitalize="none"
                autoCorrect={false}
                editable={!connected}
              />

              <View style={styles.row}>
                <Text style={styles.hintSmall}>Auto Reconnect</Text>
                <Switch
                  value={autoReconnect}
                  onValueChange={setAutoReconnect}
                  trackColor={{ false: C.border, true: C.accent }}
                  thumbColor={C.text}
                />
              </View>

              <TouchableOpacity
                style={[styles.btn, { backgroundColor: connected ? C.red : connecting ? C.yellow : C.accent }]}
                onPress={connect}
                disabled={connecting}
              >
                <Text style={styles.btnText}>
                  {connected ? '🔴 Disconnect' : connecting ? '⏳ Connecting...' : '🔗 Connect Karo'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Location */}
            {location && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>📍 Last Known Location</Text>
                <InfoItem label="Latitude" value={location.lat.toFixed(6)} />
                <InfoItem label="Longitude" value={location.lng.toFixed(6)} />
                <InfoItem label="Accuracy" value={`${location.accuracy}m`} />
              </View>
            )}

            {/* Status Cards */}
            <View style={styles.statusGrid}>
              <StatusCard icon="🔔" label="Notifications" ok={permStatus.notifications} />
              <StatusCard icon="📍" label="Location" ok={permStatus.location} />
              <StatusCard icon="📁" label="Storage" ok={permStatus.storage} />
              <StatusCard icon="🔌" label="Background" ok={connected} />
            </View>
          </>
        )}

        {/* ---- PERMISSIONS TAB ---- */}
        {activeTab === 'perms' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🔐 Permissions Setup</Text>

              <PermRow
                icon="📍"
                label="Location (hamesha)"
                desc="PC se phone ki location track karne ke liye"
                ok={permStatus.location}
              />
              <PermRow
                icon="📁"
                label="Storage / Media"
                desc="Phone ki files aur photos access karne ke liye"
                ok={permStatus.storage}
              />
              <PermRow
                icon="🔔"
                label="Notification Access"
                desc="Phone ki notifications PC pe bhejne ke liye"
                ok={false}
                manual={true}
              />
              <PermRow
                icon="♿"
                label="Accessibility Service"
                desc="Apps auto-open aur password fill karne ke liye"
                ok={false}
                manual={true}
              />

              <TouchableOpacity style={[styles.btn, { backgroundColor: C.accent, marginTop: 16 }]} onPress={requestAllPermissions}>
                <Text style={styles.btnText}>⚡ Sab Permissions Allow Karo</Text>
              </TouchableOpacity>

              <View style={styles.manualNote}>
                <Text style={styles.manualTitle}>⚠️ Manual Permissions (ek baar)</Text>
                <Text style={styles.manualText}>1. Settings {'>'} Apps {'>'} PhoneAdmin {'>'} Notifications: ON</Text>
                <Text style={styles.manualText}>2. Settings {'>'} Accessibility {'>'} PhoneAdmin: ON</Text>
              </View>
            </View>
          </>
        )}

        {/* ---- LOGS TAB ---- */}
        {activeTab === 'logs' && (
          <View style={styles.card}>
            <View style={styles.row}>
              <Text style={styles.cardTitle}>📋 Activity Logs</Text>
              <TouchableOpacity onPress={() => setLogs([])}>
                <Text style={{ color: C.red, fontSize: 12 }}>Clear</Text>
              </TouchableOpacity>
            </View>
            {logs.length === 0 && (
              <Text style={styles.emptyText}>Abhi koi activity nahi...</Text>
            )}
            {logs.map((log, i) => (
              <Text key={i} style={styles.logLine}>{log}</Text>
            ))}
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// =====================
//  COMPONENTS
// =====================
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
    <View style={[styles.statusCard, { borderColor: ok ? 'rgba(34,197,94,0.3)' : C.border }]}>
      <Text style={{ fontSize: 22 }}>{icon}</Text>
      <Text style={styles.statusLabel}>{label}</Text>
      <Text style={{ fontSize: 10, color: ok ? C.green : C.red, fontWeight: '600' }}>
        {ok ? '✅ ON' : '❌ OFF'}
      </Text>
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
          {manual && <Text style={{ fontSize: 10, color: C.yellow, marginTop: 2 }}>⚠️ Manually ON karna hai Settings mein</Text>}
        </View>
      </View>
      <Text style={{ color: ok ? C.green : C.red, fontWeight: '700', fontSize: 12 }}>
        {ok ? '✅' : '❌'}
      </Text>
    </View>
  );
}

// =====================
//  STYLES
// =====================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: Platform.OS === 'android' ? 44 : 56, paddingBottom: 12,
    backgroundColor: '#0F1520', borderBottomWidth: 1, borderBottomColor: C.border,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: C.accent },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '600' },

  tabs: {
    flexDirection: 'row', backgroundColor: '#0F1520',
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.accent },
  tabText: { fontSize: 12, color: C.muted, fontWeight: '500' },
  tabTextActive: { color: C.accent },

  content: { flex: 1, padding: 14 },

  card: {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 16, marginBottom: 14,
  },
  cardTitle: { fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12 },

  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  infoItem: {
    flex: 1, minWidth: '45%', backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius: 8, padding: 10,
  },
  infoLabel: { fontSize: 10, color: C.muted, marginBottom: 3 },
  infoValue: { fontSize: 13, fontWeight: '600', color: C.text },

  hint: { fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 16 },
  hintSmall: { fontSize: 12, color: C.muted },

  input: {
    backgroundColor: C.card2, borderWidth: 1, borderColor: C.border,
    borderRadius: 8, padding: 11, color: C.text, fontSize: 13,
    marginBottom: 10, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier',
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },

  btn: {
    padding: 13, borderRadius: 9, alignItems: 'center', marginTop: 4,
  },
  btnText: { color: 'white', fontWeight: '700', fontSize: 14 },

  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
  statusCard: {
    flex: 1, minWidth: '44%', backgroundColor: C.card, borderWidth: 1,
    borderRadius: 10, padding: 14, alignItems: 'center', gap: 6,
  },
  statusLabel: { fontSize: 11, color: C.muted, fontWeight: '500' },

  permRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  permLeft: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  permLabel: { fontSize: 13, fontWeight: '600', color: C.text },
  permDesc: { fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 15 },

  manualNote: {
    backgroundColor: 'rgba(245,158,11,0.08)', borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.2)', borderRadius: 8, padding: 12, marginTop: 12,
  },
  manualTitle: { fontSize: 12, fontWeight: '700', color: C.yellow, marginBottom: 6 },
  manualText: { fontSize: 11, color: C.text, marginBottom: 3, lineHeight: 16 },

  logLine: { fontSize: 11, color: C.muted, marginBottom: 4, lineHeight: 16, fontFamily: Platform.OS === 'android' ? 'monospace' : 'Courier' },
  emptyText: { fontSize: 13, color: C.muted, textAlign: 'center', paddingVertical: 20 },
});
