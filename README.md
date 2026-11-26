# Fossil Solver

Plugin mit einem Lösungsalgorithmus für das **Fossil-Excavation-Minispiel** (EF2). Es liest das aktuelle Spielfeld mit, berechnet den Zug mit den voraussichtlich wenigsten Schlägen und markiert ihn direkt auf dem Spielbrett.

Das Plugin ist **rein beobachtend**: Es sendet nie einen Spielzug, sondern zeigt nur einen Vorschlag an.

## Inhalt

- [Spielmechanik](#spielmechanik)
- [Aufbau](#aufbau)
- [Funktionsweise](#funktionsweise)
- [Einstellungen](#einstellungen)
- [Installation](#installation)
- [Grenzen](#grenzen)

## Spielmechanik

Der Solver geht von folgenden Regeln aus (siehe Kopfkommentar in `solver.js`):

- Ein Schlag auf ein verdecktes Feld verursacht **+2 Schaden** auf dem Feld und **+1 Schaden** auf jedem orthogonal angrenzenden verdeckten Feld.
- Schaden summiert sich. Ein Feld bricht, sobald der Schaden seine HP erreicht.
- Geschlagen werden dürfen nur verdeckte Felder.
- Fossilien sind starre Formen aus je vier Feldern: **1×4 waagerecht**, **4×1 senkrecht** oder **2×2**.
- Um ein Fossil freizulegen, müssen alle seine Felder gebrochen sein.
- Fossilien dürfen aneinander grenzen. Beim Aufdecken unterscheidet man sie an der Farbe.

## Aufbau

```text
Fossil Plugin/
├── plugin.json    Plugin-Manifest (id, Einstiegsdatei, Handle-Key)
├── plugin.js      Einstieg: Spielfeld beobachten, Block-Tracker, Dateien laden
├── solver.js      Lösungslogik ohne DOM und ohne Netzwerk (global FS)
├── metrics.js     Kennzahlen aus einem Spielfeld (global FXMetrics), optional
└── overlay.js     Markierung auf dem Spielbrett und Einstellungs-Panel
```

| Datei | Aufgabe |
|---|---|
| `plugin.js` | Hängt sich über `runtime.hooks.onJsonParse` an geparste Spieldaten, extrahiert Spielfeld, Fossilien und Boxen und legt sie in `window.__EF2_SOLVER_DATA__` ab. Meldet Änderungen über das Event `ef-solver-update`. Ein Block-Tracker liefert die genaue Bildschirmposition einzelner Felder (`window.__EF2_SOLVER_LOCATE__`). |
| `solver.js` | Spielfeldmodell (`covered`, `empty`, `fossil` mit HP und Schaden), die drei Fossilformen und die Zugauswahl. |
| `metrics.js` | Berechnet aus einem Spielfeld, wie viele leere Felder gebrochen wurden und wie viele Fossilien gefunden sind. Vergleicht das mit Referenzwerten aus Monte-Carlo-Simulationen (8×10 mit 5 Fossilien, 6×6 mit 3 Fossilien). |
| `overlay.js` | Hört auf `ef-solver-update`, ruft den Solver auf und markiert das Zielfeld. Steht die exakte Position noch nicht fest, zeigt es stattdessen eine Textzeile wie „R# · C#“. |

## Funktionsweise

1. Das Spiel lädt ein Spielfeld. `plugin.js` bekommt die geparsten Daten über den Hook und sucht darin Spielfeld (`blocks`), Fossilien (`coordinates`) und aufgedeckte Boxen (`discoveredBoxes`).
2. Der Stand landet in `window.__EF2_SOLVER_DATA__`, und `ef-solver-update` wird ausgelöst.
3. `overlay.js` übergibt den Stand an `FS` (`solver.js`) und bekommt den nächsten Zug.
4. Das Overlay markiert das Feld auf dem Brett. Den Schlag führst du selbst aus.

## Einstellungen

Das Overlay ist ein reines Einstellungs-Panel:

- Markierung ein oder aus
- Markierungsfarbe

Gespeichert wird im `localStorage` des Browsers unter dem Schlüssel `ef_solver_marker_settings`.

## Installation

Das Plugin benötigt eine Host-Laufzeit, die den Plugin-Vertrag bereitstellt (`runtime.hooks.onJsonParse`, `runtime.logger`). Diese Laufzeit gehört **nicht** zu diesem Repository.

1. Den Ordner `Fossil Plugin/` in das Plugin-Verzeichnis der Laufzeit kopieren.
2. In `plugin.json` ist `enabled` auf `true` gesetzt. Die Laufzeit lädt das Plugin über `entry` (`plugin.js`).

## Grenzen

- Die Referenzwerte in `metrics.js` verweisen auf eine `BENCHMARKING.md`, die in diesem Repository nicht liegt.
- Die Spielregeln sind im Solver fest einkodiert. Ändert das Spiel Schaden, Formen oder Feldgrößen, muss `solver.js` angepasst werden.
- Es gibt keine automatisierten Tests im Repository.
