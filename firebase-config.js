// Firebase-Projektkonfiguration.
// Diese Werte kommen aus der Firebase-Konsole: Projekteinstellungen -> Allgemein -> "Meine Apps" -> Web-App.
// Die Config ist KEIN Geheimnis (sie steckt in jeder Firebase-Web-App); der Schutz der Daten
// erfolgt ueber die Firestore Security Rules und den Haushalts-Code.
// Solange apiKey leer ist, laeuft die App im lokalen Modus ohne Sync (Daten nur auf diesem Geraet).
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyBmsUWrnG9r5WxSfM3kP5gD9hvDhmRcmtg",
  authDomain: "kuechenvorrat.firebaseapp.com",
  projectId: "kuechenvorrat",
  storageBucket: "kuechenvorrat.firebasestorage.app",
  messagingSenderId: "471824332910",
  appId: "1:471824332910:web:97714d95a99d37339e4e7f",
  measurementId: "G-BRGP6JLMY2"
};
