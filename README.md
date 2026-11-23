# DOOM · FERRO

**E1M1 « Hangar » de Doom 1 shareware, jouable avec le moteur FERRO 0.3.33.**

Le niveau est importé directement depuis le WAD shareware original 1.9. Ses coordonnées, secteurs, murs, hauteurs, textures, sprites et effets sonores proviennent des données originales. Le WAD complet est conservé sans modification.

## Lancer

Python 3 et un navigateur prenant en charge WebGL 2 suffisent. Aucun gestionnaire de dépendances, CDN ou serveur de jeu n’est nécessaire.

```sh
git clone https://github.com/M4D135/DOOM-FERRO.git
cd DOOM-FERRO
python3 tools/build.py
python3 -m http.server 8080 --directory dist
```

Ouvrir **http://localhost:8080**. Utiliser un serveur HTTP ; les modules JavaScript et le WAD ne se chargent pas en ouvrant directement un fichier `file://`.

Si le fichier shareware manque, `python3 tools/fetch-shareware.py` le récupère depuis l’archive originale et vérifie son empreinte avant de l’enregistrer. Le jeu chargé n’effectue aucune requête vers un domaine tiers.

## Commandes

| Action | Clavier et souris | Manette | Tactile |
|---|---|---|---|
| Se déplacer | ZQSD / WASD, flèches haut et bas | Stick gauche | Joystick gauche |
| Regarder | Souris, flèches gauche et droite | Stick droit | Glisser sur la moitié droite |
| Tirer | Clic gauche / Ctrl | RT | TIR |
| Ouvrir / utiliser | E / Espace | A ou X | UTILISER |
| Courir | Maj | L3 ou LB | Activé avec le joystick |
| Changer d’arme | 1 : poing, 2 : pistolet, 3 : fusil ; molette | Y / RB | ARME |
| Carte | Tab | View / Select | CARTE |
| Pause | Échap | Start | Ⅱ |
| Compteur technique | F3 | — | — |

Le navigateur demande le verrouillage de la souris au démarrage. Échap libère la souris et met le jeu en pause. Sur mobile, le paysage donne la plus grande surface de jeu.

## Contenu de cette version

- La géométrie exacte d’E1M1 : 85 secteurs, 475 lignes, 648 côtés, 467 sommets, 237 sous-secteurs BSP.
- Textures des murs, sols, plafonds et ciel ; lumières des secteurs, animation de l’acide, textures défilantes.
- Déplacement avec collisions, escaliers, portes, ascenseur secret, sol mobile, secrets et interrupteur de sortie.
- Objets, santé, armure, munitions ; pistolet, fusil à pompe et poing ; ennemis et barils.
- Sprites, barre de statut et sons originaux. Lecture des notes MUS de `D_E1M1` avec une synthèse Web Audio légère.
- Clavier/souris, manette standard et commandes tactiles ; pause, carte et bilan de fin du niveau.

La portée actuelle est **E1M1 en solo**. La simulation est une réimplémentation : l’IA, les déplacements et les temporisations ne revendiquent pas une équivalence binaire avec l’exécutable original. Les notes de la musique sont originales, mais ses timbres sont synthétisés et ne reproduisent pas exactement une carte OPL. Les autres cartes présentes dans le WAD, le multijoueur et la compatibilité avec les démos Doom ne font pas partie de cette version.

## Intégration réelle de FERRO

Référence canonique : [M4D135/FERRO](https://github.com/M4D135/FERRO), version **0.3.33**, commit `a443359c4741a815f384278e6427a33758d79f2f`.

Les quatre modules utilisés sont conservés octet pour octet dans `vendor/ferro/` : `fmath.js`, `surface.js`, `renderer.js`, `engine.js`. Le manifeste associe chaque fichier à son SHA256 et à son objet Git amont. La construction et les tests vérifient ces empreintes.

FERRO crée le contexte WebGL, contrôle la résolution, les matrices de caméra/projection, les cibles de rendu, la profondeur, la compilation des shaders, le cycle d’image et les statistiques. L’adaptateur `src/ferro-doom-renderer.js` fournit les surfaces texturées du WAD dans le point d’extension `fx.foule.couleur` de `FRender.draw`. Aucun autre moteur de rendu n’est inclus.

L’import WAD, les règles de Doom et ses collisions par secteurs restent dans les adaptateurs de ce jeu. Le noyau canonique de FERRO est inchangé. L’usage d’assets importés est explicite pour ce projet demandé depuis le WAD ; il ne change pas les conventions procédurales des autres jeux.

Le budget d’image est limité à **256 000 pixels** (640 × 400 de référence, adapté au ratio de l’écran). La géométrie statique représente environ **1 844 triangles** ; les sprites ajoutent leur propre coût. Les buffers de la carte sont réutilisés et ne sont reconstruits que lorsque la géométrie ou une texture de secteur change. Aucune mesure FPS sur Xbox ou téléphone physique n’est revendiquée.

## Sources

| Fichier | Rôle |
|---|---|
| `src/wad.js` | Lecture binaire IWAD, BSP, palette, patches, textures, sprites, sons |
| `src/ferro-doom-renderer.js` | Adaptateur des surfaces et sprites dans FERRO |
| `src/game.js` | Simulation E1M1, collisions, armes, ennemis, objets et actions |
| `src/audio.js` | Effets PCM originaux et séquenceur MUS |
| `src/app.js` | Interface, commandes, HUD et boucle du jeu |
| `tools/build.py` | Vérification des sources et construction de `dist/` |
| `tests/` | Contrôles sur le vrai WAD, le moteur, la géométrie et le gameplay |

## Vérifier

Les tests utilisent Node.js 20 ou plus récent :

```sh
node --test tests/*.test.mjs
python3 tools/build.py
```

### État des vérifications

Les tests automatisés vérifient les données authentiques, les quatre modules FERRO, le BSP, les textures, les sons, le score musical, les collisions, les portes, les secrets, les armes et la sortie. Le rapport `docs/qa/egl-report.json` conserve également la compilation des quatre shaders de production et quatre rendus du vrai niveau via EGL/Mesa.

![Départ d’E1M1, rendu de contrôle EGL](docs/qa/spawn-north-egl.png)

Ces images sont des **rendus OpenGL hors écran des shaders et données de production**, pas des captures de partie dans un navigateur. Le navigateur distant de cette session ne fournit pas de contexte WebGL 2 : la vérification interactive complète, le mixage audible, une manette physique et les performances sur téléphone/Xbox restent donc à confirmer sur ces appareils. Le moteur WebGL 2 et les commandes sont intégrés ; cette limite de vérification n’est pas présentée comme un test réussi.

## Provenance Doom

Le fichier `assets/doom1.wad` provient de l’archive shareware originale `doom95.zip`, conservée dans le miroir `/idgames` de la Freie Universität Berlin :

- <https://ftp.fu-berlin.de/pc/games/idgames/idstuff/doom/win95/doom95.zip>
- Vérification croisée avec la distribution DOS : <https://ftp.fu-berlin.de/pc/games/idgames/idstuff/doom/doom19s.zip>
- Documentation du format et des actions : <https://github.com/id-Software/DOOM>
- Documentation de distribution : <https://github.com/chocolate-doom/chocolate-doom/blob/master/man/INSTALL.template>

Taille : **4 196 020 octets**. SHA256 : `1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771`. Les WAD extraits des deux distributions sont identiques.

Les données et marques Doom appartiennent à id Software et à leurs ayants droit. La documentation shareware originale est conservée dans `docs/DOOM-SHAREWARE-README.TXT`. Les conditions du WAD sont distinctes de celles du code hôte et du moteur FERRO.
