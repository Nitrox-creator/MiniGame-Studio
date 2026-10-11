# MiniGame Studio

**MiniGame Studio 3D** est un éditeur de mondes voxel directement dans le navigateur. Construis un niveau, règle son ambiance, puis lance une partie pour le tester.

## Essayer en ligne

[Ouvrir MiniGame Studio sur GitHub Pages](https://nitrox-creator.github.io/MiniGame-Studio/)

Si le site n'est pas encore publié, active GitHub Pages dans **Settings → Pages** : choisis **Deploy from a branch**, la branche `main` et le dossier `/ (root)`, puis enregistre. La première publication peut prendre quelques minutes.

## Fonctionnalités

- Vues éditeur en perspective, vue du dessus et caméra FPS libre à la souris; déplacement ZQSD/WASD et accélération avec Maj.
- Test de niveau en première personne avec caméra joueur, contrôles clavier et sortie rapide avec Échap.
- Hiérarchie de scène filtrable, sélection, focus caméra, suppression annulable et déplacement précis sur les axes X/Y/Z.
- Bibliothèque de blocs, plateformes, rochers, cristaux, dangers, départs, portails, arbres, balises et eau.
- Placement à différentes hauteurs, sélection, gomme et personnalisation des couleurs.
- Modes plateformes, exploration et course; quatre environnements et réglage de la lumière.
- Test jouable, contrôles clavier, collecte de cristaux et détection des dangers et objectifs.
- Annuler/rétablir, raccourcis clavier, sauvegarde automatique locale, import/export JSON et liens de partage.
- Export d'un jeu 3D HTML à partager.

## Lancer en local

Le projet n'a pas d'étape de compilation. Comme Three.js est chargé depuis jsDelivr, une connexion Internet est nécessaire. Ouvre `index.html` avec un serveur HTTP local, par exemple l'extension **Live Server** de VS Code; évite `file://`, qui peut bloquer les modules JavaScript.

## Publication GitHub Pages

Le dépôt est configuré pour un hébergement statique. Dans **Settings → Pages**, publie la branche `main` depuis `/ (root)`. Le point d'entrée `index.html` charge `app.js`; Three.js et ses contrôles sont importés depuis jsDelivr via l'import map. Aucun backend n'est requis.

Les sauvegardes automatiques restent dans le navigateur utilisé. Exporte le projet en JSON ou crée un lien de partage pour le transférer.
