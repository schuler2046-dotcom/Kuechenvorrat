# Küchenvorrat

Gemeinsame Vorrats-, Rezept-, Wochenplan- und Einkaufslisten-App für den Haushalt.
Installierbare PWA (vanilla HTML/CSS/JS, kein Build-Step), Echtzeit-Sync über Firebase Firestore.

**Live:** https://schuler2046-dotcom.github.io/Kuechenvorrat/

## Funktionen

- **Vorrat**: Artikel nach Lagerort (Gefriertruhe, Vorratsschrank, Kühlschrank) und Kategorie, Schnellerfassung per Mehrzeilen-Eingabe oder Diktat. Mengen in g, ml, stk oder **Packungen** (mit hinterlegtem Inhalt je Packung, z. B. 1 Packung = 1 kg Mehl). Plus/Minus ändert je Einheit sinnvoll (g/ml ±50, Stück/Packung ±1).
- **Rezepte**: Bildkarten mit Suche, Filter (Alle, Kochbar jetzt, süß, deftig, eigene Kategorien), Detailansicht mit Portionsrechner, Zutaten-Status gegen den Vorrat (genug, knapp, fehlt, Ersatz), Zubereitung, Link zum Original. Jedes Rezept lässt sich von Hand bearbeiten (Mengen, Einheiten, Schritte, Bild). KI-Vorschläge per Copy-Paste über die Claude-App.
- **Zutaten-Abgleich**: erkennt Öl = Olivenöl, Plural, Beiwörter (rote Zwiebel = Zwiebel), Ersatz (Rapsöl für Olivenöl), Grundvorrat (Salz, Pfeffer, Wasser) und lernt eigene Zuordnungen („Hab ich anders“). Große Mengen (Mehl, Nudeln, Reis …) werden in Gramm geprüft, Gewürze und Kleinmengen nur auf „vorhanden?“.
- **Kochmodus** mit Display-an und Portionsrechner. Am Ende **„Gekocht – Zutaten abbuchen“**: zeigt je Zutat, was aus dem Vorrat abgezogen wird, ein Klick bucht ab, Rückgängig möglich.
- **Wochenplan**: Gericht pro Wochentag, fehlende Zutaten mit Fehlmenge landen automatisch auf der Einkaufsliste (Herkunft „Wochenplan“). Der Abgleich ändert nur offene Plan-Einträge; eigene und abgehakte Einträge bleiben unberührt.
- **Einkauf**: geteilte Einkaufsliste, abhakbar, Abgehaktes wandert (einheitenbewusst) in den Vorrat.
- **Instagram-Import**: Einstellungen → „Instagram-Rezepte importieren“ spielt die Datei aus der Instagram-Sync ein (additiv, Titelbilder privat in Firestore). Vorhandene Rezepte ohne Bild bekommen beim erneuten Import das Bild aus der Datei; Rezepte mit Bild oder von Hand bearbeitete bleiben unberührt.
- **Sync**: Änderungen erscheinen sofort auf allen Geräten (Firestore `onSnapshot`), offline nutzbar mit automatischem Abgleich.
- **Datensicherung**: JSON-Export/-Import in den Einstellungen (Titelbilder sind nicht enthalten).

## Aufbau

Vanilla JS als ES-Module, kein Build-Step.

| Datei | Inhalt |
|---|---|
| `app.js` | Zustand, Rendering, Events, Routing (`#/rezept/<id>`, `/kochen`, `/bearbeiten`, `/gekocht`, `#/neu`, `#/einstellungen`) |
| `units.js` | Einheiten, Packungsgrößen, Umrechnung, Formatierung (rein) |
| `matching.js` | Begriffsabgleich und Mengenprüfung Zutat ↔ Vorrat (rein) |
| `cook.js` | Abbuchungsplan für „Gekocht“ (rein) |
| `shopping.js` | Einkaufsbedarf aus Rezept-Bewertungen (rein) |
| `ig-import.js` | Import-Datei der Instagram-Sync umwandeln (rein) |
| `recipes-ui.js` | HTML-Bausteine für Karten, Detail, Editor, Abbuchen-Seite |
| `store.js` | Firestore bzw. lokaler Speicher, `readKey`/`writeKey` für einzelne Dokumente (Bilder) |
| `parse.js`, `ai.js`, `voice.js`, `images.js`, `constants.js`, `util.js` | Parser, KI-Prompts, Sprache, Bildverkleinerung, Konstanten |

Erweiterte Datenfelder (alle optional, Schema nur additiv): Vorratsartikel `packSize`/`packUnit`; Rezepte `servings`, `category`, `source`, `igId`, `sourceUrl`, `author`, `status`, `hasImage`, Zutat `note`/`approx`; `meta`: `staples`, `aliases`, `aliasNames`, `packSizes`, `recipeCategories`, `cookLog`, `undo`. Titelbilder liegen als Dokument `data/img-<rezeptId>` (`{json: {dataUrl}}`).

## Tests

```
npm test
```

Führt die Unit-Tests der reinen Module (`tests/*.test.js`) mit dem eingebauten Node-Testrunner aus (Node 20+).

## Datensicherheits-Prinzipien (verbindlich für alle künftigen Änderungen)

1. Daten liegen ausschließlich in Firestore, nie in App-Dateien. App-Updates fassen Nutzdaten nicht an.
2. Starter-Rezepte werden nur einmal pro Haushalt eingespielt (`meta.seededV1`).
3. Schema-Änderungen nur additiv — Feld-/Dokumentnamen werden nie umbenannt oder entfernt.
4. Schreibvorgänge sind Read-before-write (Firestore-Transaktionen) pro Dokument.
5. JSON-Export/-Import als Sicherheitsnetz; Import ist rein additiv und löscht nie.

**Bei jedem Update der App-Dateien: `CACHE`-Version in `sw.js` hochzählen** (`vorrat-vN` (aktuell v16)),
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
