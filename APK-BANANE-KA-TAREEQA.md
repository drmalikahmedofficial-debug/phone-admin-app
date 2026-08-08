# 📦 APK Banane Ka Tareeqa

## Step 1: Expo Account Banao (FREE)
1. Browser mein jao: https://expo.dev
2. "Sign Up" karo (email se, free hai)
3. Account confirm karo email se

## Step 2: EAS CLI Install Karo
CMD/Terminal kholo aur likho:
```
npm install -g eas-cli
```

## Step 3: Login Karo
```
eas login
```
(Expo wala email aur password dalo)

## Step 4: phone-app folder mein jao
```
cd Desktop\phone-app
```

## Step 5: Dependencies Install Karo
```
npm install
```

## Step 6: EAS Configure Karo (sirf pehli baar)
```
eas build:configure
```
(Sab kuch Enter dabate jao — default settings theek hain)

## Step 7: APK Build Karo ⚡
```
eas build --platform android --profile preview
```

Ye command:
- Code Expo ke servers pe upload karega
- Wahan APK build hogi (5-10 minute lagenge)
- Phir ek download link milega

## Step 8: APK Download Karo
- Build complete hone pe link aayega terminal mein
- Ya expo.dev pe login karke "Builds" mein bhi milega
- Link se APK download karo

## Step 9: Phone Pe Install Karo
1. APK file phone pe copy karo (USB se ya WhatsApp se bhi bhej sakte ho)
2. Phone mein "Unknown Sources" allow karo:
   Settings > Security > Unknown Sources: ON
3. APK file pe tap karo → Install

## ✅ Ho Gaya!
Ab phone pe PhoneAdmin app install hai!
Backend chalaao aur connect karo.

---

## ⚠️ Agar Error Aaye

**"eas: command not found"**
→ Terminal band karke dobara kholo, phir try karo

**"Not logged in"**
→ `eas login` dobara karo

**Build fail ho**
→ Mujhe error ka screenshot dikhaao, fix kar dunga
