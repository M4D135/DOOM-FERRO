# DOOM · FERRO — Hangar procédural

**E1M1 reconstruit par le code et rendu par le moteur FERRO 0.3.33.** Version du jeu : **0.2.0**.

Le runtime ne charge aucun WAD, fichier image, modèle ou enregistrement sonore. Les générateurs construisent la géométrie, les matériaux, le ciel, les personnages, les objets, les armes, le HUD, les effets sonores et une musique originale. Ils utilisent des calculs, des primitives et des graines déterministes ; aucun média encodé ne remplace les anciens fichiers.

Le **tracé d’E1M1 est un plan fixe de référence** : coordonnées des murs, hauteurs, connexions, mécanismes et placements constituent les paramètres de construction. Le niveau n’est donc pas aléatoire. Les surfaces et leur triangulation sont calculées au lancement depuis ces contours, sans reprendre le BSP ni les triangles originaux. Les graphismes et la musique sont de nouvelles interprétations procédurales et ne reproduisent pas les médias originaux à l’identique.

## Lancer

Python 3 et un navigateur prenant en charge WebGL 2 suffisent. Aucun gestionnaire de dépendances, CDN ou serveur de jeu n’est nécessaire.

```sh
git clone https://github.com/M4D135/DOOM-FERRO.git
cd DOOM-FERRO
python3 tools/build.py
python3 -m http.server 8080 --directory dist
```

Ouvrir **http://localhost:8080**. Les modules JavaScript nécessitent un serveur HTTP. Le build fonctionne sans le dossier `reference/` et le jeu n’effectue aucune requête de média ni vers un domaine tiers.

## Ce qui est généré

| Élément | Construction |
|---|---|
| Carte | Balayage des contours des 85 secteurs du plan, création de 295 cellules convexes ; triangulation et index spatial calculés |
| Murs, sols et plafonds | Métal, rivets, panneaux, écrans, pierre, éclairages et fluides produits à partir de motifs et de bruits déterministes |
| Ciel | Panorama de nuages, montagnes et installation construit mathématiquement |
| Ennemis et objets | Primitives de volumes et de dessin raster, poses, orientations et animations générées |
| Armes, HUD et logo | Dessin par le code, chiffres et lettres vectoriels, aucune police bitmap extraite |
| Sons | Oscillateurs, bruit déterministe, filtres et enveloppes ; spatialisation selon la position du joueur |
| Musique | Composition originale par règles : basse, batterie, drone et mélodie ; aucune partition extraite |

Les ressources visuelles sont créées à la demande puis mises en cache. Les effets sonores sont calculés une fois et réutilisés. La musique conserve sa position lors des pauses. Le nombre de voix simultanées est plafonné à 24.

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
| Diagnostic du rendu et position | F3 | — | — |

Le navigateur demande le verrouillage de la souris au démarrage. Échap libère la souris et met le jeu en pause. Sur mobile, le paysage donne la plus grande surface de jeu.

Au menu, la croix directionnelle ou le stick gauche de la manette choisit la difficulté ; A ou Start démarre. La souris reste utilisable sur un PC à écran tactile. Après une pause, relâcher puis presser de nouveau une gâchette maintenue permet de reprendre le tir. Un geste clavier, souris ou tactile active l’audio si le démarrage a eu lieu à la manette.

## Gameplay et portes

Le jeu comprend déplacements et collisions, escaliers, portes, ascenseur secret, sol mobile, secrets, interrupteur de sortie, santé, armure, munitions, trois armes, ennemis et barils. Les collisions consultent les hauteurs courantes des secteurs, également utilisées pour reconstruire les surfaces visibles. Les cellules générées servent à la fois au rendu des sols et à la localisation des acteurs.

Les tests traversent les huit faces des quatre portes en avançant pendant leur ouverture, avec les entités présentes. Un parcours du départ à la sortie utilise les déplacements et interactions réels de la simulation avec les six ennemis actifs. Un ennemi vivant ou un baril solide peut occuper un passage ; un cadavre ne doit plus le bloquer.

**Le blocage de porte signalé dans la version précédente n’a pas été reproduit lors de ces contrôles.** Aucun assouplissement arbitraire des collisions n’est présenté comme un correctif. Le panneau F3 affiche maintenant les coordonnées et l’orientation nécessaires pour identifier une situation précise. Les modules du build portent une révision commune afin qu’un rechargement ne mélange pas d’anciennes et de nouvelles versions du code.

La portée actuelle reste **E1M1 en solo**. La simulation est une réimplémentation : l’IA, les déplacements et les temporisations ne revendiquent pas une équivalence binaire avec l’exécutable original. Les autres niveaux, le multijoueur et la compatibilité avec les démos Doom ne font pas partie de cette version.

## Intégration de FERRO

Référence canonique : [M4D135/FERRO](https://github.com/M4D135/FERRO), version **0.3.33**, commit `a443359c4741a815f384278e6427a33758d79f2f`.

Les quatre modules utilisés sont conservés octet pour octet dans `vendor/ferro/` : `fmath.js`, `surface.js`, `renderer.js`, `engine.js`. Le manifeste associe chaque fichier à son SHA256 et à son objet Git amont. La construction et les tests vérifient ces empreintes.

FERRO crée le contexte WebGL, contrôle la résolution, les matrices de caméra et de projection, les cibles de rendu, la profondeur, la compilation des shaders, le cycle d’image et les statistiques. L’adaptateur `src/ferro-doom-renderer.js` fournit les surfaces et sprites générés dans le point d’extension `fx.foule.couleur` de `FRender.draw`. Aucun autre moteur de rendu n’est inclus.

Les générateurs et les règles de Doom, dont les collisions par secteurs, appartiennent au jeu. Le noyau canonique de FERRO reste inchangé.

Le budget d’image est limité à **256 000 pixels** (640 × 400 de référence, adapté au ratio de l’écran). La carte initiale comporte **2 025 triangles** ; les sprites ajoutent leur propre coût. Les buffers de carte sont réutilisés et ne sont reconstruits que lorsque la géométrie ou une texture de secteur change. Aucune mesure FPS sur Xbox ou téléphone physique n’est revendiquée.

## Organisation

| Fichier ou dossier | Rôle |
|---|---|
| `src/e1m1-plan.js` | Paramètres d’architecture et de placements du plan fixe |
| `src/procedural-map.js` | Génération des cellules, géométrie et index spatial |
| `src/procedural-materials.js` | Recettes de murs, sols, plafonds et ciel |
| `src/procedural-raster.js` | Primitives de dessin des ressources |
| `src/procedural-sprites.js` | Personnages, objets, armes et interface calculés |
| `src/procedural-resources.js` | Accès et comptage des ressources générées |
| `src/procedural-audio.js` | Synthèse des sons, composition et lecture musicales |
| `src/ferro-doom-renderer.js` | Adaptateur de rendu dans FERRO |
| `src/game.js` | Simulation, collisions, armes, ennemis et mécanismes |
| `src/app.js`, `src/input.js` | Interface, commandes, HUD et boucle du jeu |
| `tools/build.py` | Vérification de FERRO et build du seul graphe runtime |
| `tools/verify.py` | Qualification mesurée et double construction reproductible |
| `reference/`, `tests/reference/` | Archive et outils de recherche, exclus du runtime et de sa qualification |

## Vérifier

Les tests utilisent Node.js 20 ou plus récent :

```sh
node --test tests/*.test.mjs
python3 tools/build.py
```

Pour exécuter les tests, construire deux fois et enregistrer les preuves mesurées :

```sh
python3 tools/verify.py --write-report
```

Le rapport `docs/qa/validation.json` conserve le nombre réel de tests, la révision du build, sa taille et sa reproductibilité. Le journal TAP complet est dans `docs/qa/node-tests.txt`. Le test de build utilise une copie temporaire contenant uniquement le code, le moteur et l’interface : aucune archive n’est disponible. Il vérifie les dépendances, leurs révisions, l’absence de média livré, la suppression des anciennes sorties et les empreintes de FERRO.

Les tests de commandes exécutent les gestionnaires de l’application avec un DOM et des périphériques simulés, la vraie carte générée et la vraie simulation. Les contrôles de synthèse audio portent sur les signaux, la spatialisation et le cycle de vie avec un contexte audio simulé.

Le script `python3 tests/render-egl.py` compile les shaders de production et produit des images de contrôle avec EGL/Mesa. Son rapport `docs/qa/egl-report.json` enregistre la géométrie, les vues et l’empreinte de l’adaptateur utilisé.

![Départ d’E1M1, rendu procédural de contrôle EGL](docs/qa/spawn-north-egl.png)

Ces images sont des **rendus OpenGL hors écran des shaders et données de production**, pas des captures de partie dans un navigateur. Le navigateur distant ne fournissait pas de contexte WebGL 2 lors du contrôle précédent ; l’accès au nouvel aperçu a ensuite été refusé par sa politique d’URL. La vérification interactive complète, le mixage audible, une manette physique et les performances sur téléphone/Xbox restent à confirmer sur ces appareils.

GitHub Actions n’a pas pu démarrer lors de la qualification précédente, à cause d’un blocage de facturation ou de plafond du compte. Les résultats locaux et EGL sont distincts de cette qualification distante. Le workflow conserve le contrôle `--check-committed` pour comparer les fichiers de `dist/` à un nouveau build.

## Référence et provenance

`reference/doom1.wad` est conservé comme archive de recherche, avec sa provenance, les anciens lecteurs et leurs tests séparés. Il n’est ni nécessaire au build, ni copié dans `dist/`, ni chargé par le jeu. L’outil `tools/export-e1m1-plan.mjs` permet de refaire le relevé architectural lors du développement.

Taille de l’archive : **4 196 020 octets**. SHA256 : `1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771`.

- [Archive shareware de référence](https://ftp.fu-berlin.de/pc/games/idgames/idstuff/doom/win95/doom95.zip)
- [Source publiée des règles et formats Doom](https://github.com/id-Software/DOOM)
- Conditions shareware conservées dans `docs/DOOM-SHAREWARE-README.TXT`

Les données du plan et les marques Doom appartiennent à id Software et à leurs ayants droit. Les conditions de l’archive de référence sont distinctes de celles du code du jeu et du moteur FERRO.
