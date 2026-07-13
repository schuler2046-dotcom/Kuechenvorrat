// Firebase-Projektkonfiguration.
// Diese Werte kommen aus der Firebase-Konsole: Projekteinstellungen -> Allgemein -> "Meine Apps" -> Web-App.
// Die Config ist KEIN Geheimnis (sie steckt in jeder Firebase-Web-App); der Schutz der Daten
// erfolgt ueber die Firestore Security Rules und den Haushalts-Code.
// Solange apiKey leer ist, laeuft die App im lokalen Modus ohne Sync (Daten nur auf diesem Geraet).
window.FIREBASE_CONFIG = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};
