# Küchenvorrat

Gemeinsame Vorrats-, Rezept-, Wochenplan- und Einkaufslisten-App für den Haushalt.
Installierbare PWA (vanilla HTML/CSS/JS, kein Build-Step), Echtzeit-Sync über Firebase Firestore.

**Live:** https://schuler2046-dotcom.github.io/Kuechenvorrat/

## Funktionen

- **Vorrat**: Artikel nach Lagerort (Gefriertruhe, Vorratsschrank, Kühlschrank) und Kategorie (Fleisch & Fisch, Gemüse & Obst, …), Schnellerfassung per Mehrzeilen-Eingabe oder Diktat über die Handy-Tastatur.
- **Rezepte**: Tag-Filter, sortiert nach Verfügbarkeit der Zutaten, Schnell-Einfüge-Parser, KI-Vorschläge per Copy-Paste über die Claude-App (kostenlos).
- **Wochenplan**: Gericht pro Wochentag, fehlende Zutaten auf Knopfdruck auf die Einkaufsliste.
- **Einkauf**: geteilte Einkaufsliste, abhakbar, Abgehaktes wandert per Knopf in den Vorrat.
- **Sync**: Änderungen erscheinen sofort auf allen Geräten (Firestore `onSnapshot`), offline nutzbar mit automatischem Abgleich.
- **Datensicherung**: JSON-Export/-Import im Fußbereich der App.

## Datensicherheits-Prinzipien (verbindlich für alle künftigen Änderungen)

1. Daten liegen ausschließlich in Firestore, nie in App-Dateien. App-Updates fassen Nutzdaten nicht an.
2. Starter-Rezepte werden nur einmal pro Haushalt eingespielt (`meta.seededV1`).
3. Schema-Änderungen nur additiv — Feld-/Dokumentnamen werden nie umbenannt oder entfernt.
4. Schreibvorgänge sind Read-before-write (Firestore-Transaktionen) pro Dokument.
5. JSON-Export/-Import als Sicherheitsnetz; Import ist rein additiv und löscht nie.

**Bei jedem Update der App-Dateien: `CACHE`-Version in `sw.js` hochzählen** (`vorrat-vN`),
sonst liefern installierte Home-Screen-Apps die alte Version aus.

## Firebase einrichten (einmalig, ~10 Minuten)

Solange `firebase-config.js` leer ist, läuft die App im lokalen Modus (Daten nur auf dem Gerät, kein Sync).

1. https://console.firebase.google.com öffnen, mit dem Google-Konto anmelden.
2. **Projekt hinzufügen** → Name z. B. `kuechenvorrat` → Google Analytics kann deaktiviert bleiben → **Projekt erstellen**.
3. Links im Menü **Build → Firestore Database** → **Datenbank erstellen** → Standort `europe-west3 (Frankfurt)` → im **Produktionsmodus** starten.
4. Im Reiter **Regeln** den kompletten Inhalt durch die Datei [`firestore.rules`](firestore.rules) aus diesem Repo ersetzen → **Veröffentlichen**.
5. Links **Build → Authentication** → **Jetzt starten** → Reiter **Sign-in method** → **Anonym** aktivieren → Speichern.
6. Zahnrad oben links → **Projekteinstellungen** → Reiter **Allgemein** → unter „Meine Apps" auf das **Web-Symbol `</>`** klicken → App-Spitzname z. B. `vorrat-web` → **App registrieren** (Hosting nicht nötig).
7. Den angezeigten `firebaseConfig`-Block kopieren und die Werte in `firebase-config.js` eintragen (apiKey, authDomain, projectId, storageBucket, messagingSenderId, appId).
8. Änderung committen und pushen — fertig. Beim nächsten Öffnen fragt die App nach dem gemeinsamen Haushalts-Code.

## Zugriffsschutz

Die App-Dateien sind öffentlich (GitHub Pages), die Daten nicht: Firestore verlangt eine
(anonyme) Anmeldung über die App, und der frei gewählte **Haushalts-Code** ist Teil des
Datenbank-Pfads — nur wer ihn kennt, erreicht eure Dokumente. Einen langen Code wählen.

## Lokal testen

```
python -m http.server 8000
```

Dann http://localhost:8000 öffnen. Ohne Firebase-Config läuft die App im lokalen Modus.

## Entwicklung

- `referenz/kuechenvorrat-artifact.html` — das ursprüngliche Claude-Artifact (Design- und Logik-Vorlage).
- `referenz/make_icons.py` — erzeugt die Icons neu (benötigt Pillow).
