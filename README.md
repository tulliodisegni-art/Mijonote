# Mijonote – Carnet de recettes

Version installable (PWA) de Mijonote : livres de cuisine et recettes de famille, lus par Claude à partir de photos.

- Les recettes et les photos restent sur l'appareil (IndexedDB).
- La lecture des recettes utilise Claude avec la clé Anthropic de la personne (Mon compte → Claude), gardée sur l'appareil.
- Mon compte → Sauvegarde : exporter / restaurer tout le carnet dans un fichier.

## Installer
Ouvrir le site dans Safari (iPhone) → Partager → « Sur l'écran d'accueil ». Sur Android : Chrome → menu → « Installer l'application ».

## Développement
`src/mijonote.html` est l'appli ; `web/` contient le shim (`shim.js`), le service worker, le manifeste et les icônes.
`python scripts/build.py` construit `_site/`, publié par GitHub Pages à chaque push sur `main`.
