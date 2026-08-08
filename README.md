# 📱 PhoneAdmin - Phone App

PC se phone control karne wali app (Android).

## ⚡ Setup (sirf ek baar)

### Step 1: Node.js install karo
nodejs.org se download karo (agar nahi hai)

### Step 2: Expo CLI install karo
```
npm install -g expo-cli
```

### Step 3: Phone pe "Expo Go" app install karo
- Google Play Store se "Expo Go" install karo

### Step 4: Dependencies install karo
```
cd phone-app
npm install
```

## 🚀 Test Karne Ka Tareeqa

### Step 1: Backend pehle chalaao
```
cd phone-admin
npm start
```

### Step 2: Phone app chalaao
```
cd phone-app
npx expo start
```

### Step 3: QR Code Scan karo
- Phone pe Expo Go app kholo
- QR code scan karo (terminal mein dikhega)
- App phone pe khul jayegi!

### Step 4: PC ka IP address dalo
- App mein "PC ka IP Address" wali field mein PC ka IP dalo
- CMD mein `ipconfig` se milega (IPv4 Address)
- Misal: http://192.168.1.5:3000

### Step 5: "Connect Karo" dabao
- Dashboard mein phone appear ho jayega!

## 📱 App Features

- 🔗 PC backend se connect/disconnect
- 📍 Location tracking (real-time)
- 🔋 Battery status
- 📱 Device info (model, brand, Android version)
- 📋 Activity logs
- 🔐 Permissions setup guide
- Auto reconnect (agar connection toot jaye)

## ⚠️ Note

Kuch features (Notification Access, Accessibility, Screenshot, Flashlight)
asli APK build mein puri tarah kaam karenge. Expo Go se basic testing ho sakti hai.
