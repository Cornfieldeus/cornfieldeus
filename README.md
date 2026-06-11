# Szociológia tanuló

## Futtatás

1. Csomagold ki a fájlokat egy mappába.
2. Kattints duplán az `index.html` fájlra.
3. A webapp helyi fájlként, `file://` protokollon fut. Nem kell build step, csomagkezelő, dev server vagy backend.

## Fájlok

- `index.html`
- `styles.css`
- `app.js`
- `data.js`

## Ellenőrzés

- `app.js`: `node --check app.js`
- Adatok: 7 téma, 25 kiemelt szám, 130 kártya, 40 kvízkérdés
- Böngészős `file://` próba: a Codex beépített böngészője ebben a környezetben URL-policy miatt blokkolta a helyi fájl megnyitását, ezért valódi böngészős futtatást itt nem tudtam elvégezni.

Ajánlott böngészők: Chrome, Edge, Firefox friss verziói.
