# DOOM · FERRO — Hangar procédural en 3D

**E1M1 reconstruit par le code et rendu par le moteur FERRO 0.3.33.** Version du jeu : **0.6.0**.

Le runtime ne charge aucun WAD, fichier image, modèle ou enregistrement sonore. Les générateurs construisent la géométrie, les matériaux, le ciel, les personnages, les objets, les armes, le HUD, les effets sonores et une musique originale. Ils utilisent des calculs, des primitives et des graines déterministes ; aucun média encodé ne remplace les anciens fichiers.

Le **tracé d’E1M1 est un plan fixe de référence** : coordonnées des murs, hauteurs, connexions, mécanismes et placements constituent les paramètres de construction. Le niveau n’est donc pas aléatoire. Les surfaces et leur triangulation sont calculées au lancement depuis ces contours, sans reprendre le BSP ni les triangles originaux.

Les visuels prennent maintenant les **assets de Doom PC de 1993 comme références directes** : dimensions des textures, motifs des panneaux, palettes, silhouettes, vêtements, objets et armes. Les ennemis, les objets, les cadavres, les projectiles et l’arme tenue sont des **maillages 3D générés**, avec leurs propres faces, normales et profondeur. Aucun de ces éléments n’est une image tournée vers la caméra. Les parties non visibles dans les dessins d’origine sont reconstruites en volume ; les recettes ne revendiquent pas une identité pixel par pixel. La musique reste une composition procédurale originale.

## Lancer

**Le jeu complet est livré dans un seul fichier : `dist/index.html`.** Il contient les styles, les quatre modules canoniques FERRO et tous les générateurs. Il peut être déplacé seul et ouvert localement dans un navigateur prenant en charge WebGL 2 ; aucun fichier voisin, CDN ou serveur de jeu n’est nécessaire.

Pour reconstruire ce fichier depuis les sources, Python 3 suffit :

```sh
git clone https://github.com/M4D135/DOOM-FERRO.git
cd DOOM-FERRO
python3 tools/build.py
```

Ouvrir ensuite `dist/index.html`. Pour un accès HTTP facultatif, lancer `python3 -m http.server 8080 --directory dist`, puis ouvrir **http://localhost:8080**. Le build fonctionne sans le dossier `reference/` ; le jeu ne charge aucune dépendance ni média.

Les sources de développement restent séparées dans `src/` pour garder les générateurs lisibles. Le linker réunit leur graphe statique dans des portées isolées, conserve les scripts FERRO octet pour octet et échoue sur une dépendance absente, un cycle ou une syntaxe de module non prise en charge. Le résultat utilise des scripts classiques intégrés, sans import de module depuis une URL `file:`, `eval`, archive encodée ni décompression au démarrage. Les métadonnées et empreintes du moteur sont incluses dans un bloc JSON du même HTML.

## Ce qui est généré

| Élément | Construction |
|---|---|
| Carte | Balayage des contours des 85 secteurs du plan, création de 295 cellules convexes ; triangulation et index spatial calculés |
| Murs, sols et plafonds | Métal, rivets, panneaux, écrans, pierre, éclairages et fluides produits à partir de motifs et de bruits déterministes |
| Ciel | Nuages gris et crêtes rocheuses calculés d’après SKY1 |
| Ennemis | Volumes triangulés des zombiemen, shotgun guys et imps ; marche, attaque, douleur et chute ; orientation propre à chaque acteur |
| Objets et effets | Barils, lampes, colonnes, armures, bonus, caisses de soins, munitions, armes au sol, corps, boules de feu et explosions en 3D |
| Armes en main | Pistolet, fusil à pompe et poing en 3D ; mains, recul, pompage et flashes en volume |
| HUD et logo | Interface 2D calculée : barre grise, chiffres rouges, visage nu et logo bleu/or ; contours vectoriels sans police bitmap extraite |
| Sons | Oscillateurs, bruit déterministe, filtres et enveloppes ; spatialisation selon la position du joueur |
| Musique | Composition originale par règles : basse, batterie, drone et mélodie ; aucune partition extraite |

Les ressources visuelles sont créées à la demande puis mises en cache. Les poses identiques partagent leur géométrie et sont rendues par instanciation. Changer l’angle de la caméra ne change ni le maillage ni l’orientation d’un acteur. Les effets sonores sont calculés une fois et réutilisés. La musique conserve sa position lors des pauses. Le nombre de voix simultanées est plafonné à 24.

## Volumes, matières et lumière en 0.6.0

Cette refonte reprend ensemble les formes et leur éclairage. Les têtes, torses et membres utilisent des surfaces anatomiques continues. Les courbes tiennent compte de l’espacement réel des repères pour conserver des normales lisses. Les bras et jambes se déforment autour des articulations ; le transport de leurs repères et des normales évite les retournements aux coudes. Les yeux, paupières, oreilles, lèvres et dents sont des volumes distincts intégrés à la tête. Les cols et poches sont des panneaux courbes à épaisseur réelle.

Les mains des armes utilisent des surfaces implicites fusionnées, avec paumes, pouces, doigts et poignets raccordés. Le pistolet et le fusil possèdent une carcasse profilée, des assemblages, une chambre, des organes de visée, un pontet réellement ouvert et une bouche de canon creuse. Le bois de la crosse et de la pompe suit une seule surface. Les barils, colonnes, armures, casques, flacons et trousses reçoivent des rebords, épaisseurs, joints, charnières, câbles et fixations adaptés à leur construction.

Le rendu des matières est repris avec **GGX, Smith corrélé et Schlick**, calculés en lumière linéaire, puis une courbe filmique et une conversion d’affichage. Les modèles distinguent peau, tissu, cuir, métal, peinture, os, verre, bois, sang et surfaces lumineuses. Pores, fibres et grain sont calculés dans leurs coordonnées locales, conservées pendant les mouvements. Les visages restent des reconstructions sculptées stylisées ; cette version ne revendique pas un photoréalisme acquis.

Les murs, portes, consoles, sols et plafonds disposent de **trois cartes calculées indépendamment** : couleur/couverture, normale/rugosité et métal/occlusion/émission/hauteur. Les grands motifs et dimensions de Doom sont conservés ; les détails sont évalués à la nouvelle résolution, jusqu’à 1024 pixels sur le grand côté. La parallaxe ajoute du relief apparent aux surfaces proches ; elle ne change ni les silhouettes architecturales ni les collisions. Les mipmaps, le filtrage linéaire et l’anisotropie disponible réduisent le scintillement à distance.

Jusqu’à six sources locales proviennent des plafonds et lampes murales du plan, écrans d’ordinateur, ouvertures extérieures, bassins toxiques et effets de tir. Le remplissage artificiel des pièces est réduit ; des ombres plus froides, une lumière fluorescente localisée et une brume de distance discrète donnent une ambiance plus lugubre. Les secteurs et leurs niveaux lumineux originaux restent inchangés. Les secteurs qui clignotent ou pulsent modulent aussi la lumière directe. Une carte de profondeur produit les ombres du monde ; une seconde, ajustée à la géométrie visible de l’arme, résout les petits contacts autour des mains. Les objets hors cadre peuvent encore projeter une ombre dans le champ. Les comparaisons de profondeur filtrées sont complétées par une occlusion de contact qui utilise les normales lisses, puis un léger filtrage des contours.

L’éclairage indirect, la transmission de la peau et les réflexions d’environnement restent des approximations. Ce chemin n’est ni du ray tracing, ni un calcul complet d’illumination globale. Le fonctionnement exact, les sources des formules et les limites sont décrits dans [procedural-rendering.md](docs/procedural-rendering.md).

### Géométrie et caches

Les visages ont été repris dans leurs volumes : orbites plus enfoncées, paupières resserrées, pommettes et mâchoires creusées, bouches asymétriques et raccords du cou corrigés. L’Imp possède une posture plus ramassée et des pointes mieux proportionnées. Les vêtements reçoivent des plis suivant leur coupe. Le poing, le poignet et l’avant-bras forment une surface continue ; les cadavres et les restes PLAYN, PLAYW et POL5 utilisent des constructions distinctes d’après leurs références. La patine des armures, barils, armes et trousses est calculée selon leur forme et leur hauteur, sans image plaquée.

Les trois niveaux géométriques partagent leurs designs et leur rig. Une marge autour des distances de transition évite les changements incessants de détail. La visibilité est testée avant de générer une pose. Les pièces fixes sont construites une fois, puis les poses sont composées directement dans des tableaux Float32. Les ombres d’objets uniquement hors champ utilisent au plus le niveau intermédiaire.

L’inventaire ci-dessous provient des buffers réels, au repos ou à la première image d’animation ; il ne mesure pas les FPS. Le fichier [model-detail.json](docs/qa/model-detail.json) contient les autres familles, les poses d’action, les dimensions, les matières et les empreintes des sources.

| Modèle | Proche | Intermédiaire | Lointain |
|---|---:|---:|---:|
| Zombieman | 33596 | 7208 | 1676 |
| Shotgun guy | 30240 | 6944 | 1624 |
| Imp | 25288 | 6088 | 1816 |
| Baril | 6440 | 1496 | 350 |
| Colonne technique | 11840 | 1932 | 288 |
| Armure | 8400 | 2192 | 368 |
| Fusil au sol | 9124 | 2380 | 344 |

Les armes tenues au repos comptent **12 460 triangles pour le pistolet**, **23 532 pour le fusil** et **10 628 pour le poing**. Le flash volumique ajoute 206 triangles aux armes à feu. Les pièces communes, premières poses et cartes de matière sont préparées pendant un chargement avec progression affichée, en laissant le navigateur afficher entre les recettes.

Les buffers CPU conservés sont bornés : 32 Mio de pièces de personnages et 32 Mio de poses, 12 Mio d’objets, 20 Mio d’armes et 48 Mio de cartes de surfaces incluant leur tampon de hauteur temporaire. Ces valeurs ne représentent pas la mémoire totale du navigateur. Les modèles GPU restent plafonnés à 64 Mio. L’ensemble possible des 56 matières d’E1M1 utilise environ 178,2 Mio de textures GPU avec mipmaps sur ordinateur, ou 42,1 Mio avec la limite mobile de 256 pixels ; les cibles couleur, normales, profondeur et ombres s’ajoutent à ce compte.

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

**Le blocage de porte signalé dans la version précédente n’a pas été reproduit lors de ces contrôles.** Aucun assouplissement arbitraire des collisions n’est présenté comme un correctif. Le panneau F3 affiche maintenant les coordonnées et l’orientation nécessaires pour identifier une situation précise. Le HTML contient désormais la totalité du runtime : un rechargement ne peut plus mélanger des modules séparément mis en cache.

Les **trois secrets** de la référence shareware 1.9 sont vérifiés par un second parcours continu : accès à la cour et à l’armure bleue, alcôve du fusil après descente de la plateforme, puis ascenseur minuté et galerie haute avec retour par sa fenêtre. Il conserve tous les ennemis, les munitions, les objets et les collisions jusqu’à la sortie. La découverte exige le contact au sol, l’IA respecte la face de porte marquée secrète et les sons des mécanismes proviennent des secteurs mobiles. Les déclenchements, hauteurs et références sont détaillés dans [e1m1-secrets.md](docs/e1m1-secrets.md).

La portée actuelle reste **E1M1 en solo**. La simulation est une réimplémentation : l’IA, les déplacements et les temporisations ne revendiquent pas une équivalence binaire avec l’exécutable original. Les autres niveaux, le multijoueur et la compatibilité avec les démos Doom ne font pas partie de cette version.

## Intégration de FERRO

Référence canonique : [M4D135/FERRO](https://github.com/M4D135/FERRO), version **0.3.33**, commit `a443359c4741a815f384278e6427a33758d79f2f`.

Les quatre modules utilisés sont conservés octet pour octet dans `vendor/ferro/` : `fmath.js`, `surface.js`, `renderer.js`, `engine.js`. Le manifeste associe chaque fichier à son SHA256 et à son objet Git amont. La construction et les tests vérifient ces empreintes.

FERRO crée le contexte WebGL, contrôle la résolution, les matrices de caméra et de projection, les cibles de rendu, la profondeur, la compilation des shaders, le cycle d’image et les statistiques. L’adaptateur `src/ferro-doom-renderer.js` fournit les surfaces et les modèles 3D générés dans le point d’extension `fx.foule.couleur` de `FRender.draw`. Aucun autre moteur de rendu n’est inclus.

Les générateurs et les règles de Doom, dont les collisions par secteurs, appartiennent au jeu. Le noyau canonique de FERRO reste inchangé.

Le budget d’image atteint **1 024 000 pixels** sur les périphériques à pointeur précis (1280 × 800 de référence, adapté au ratio de l’écran) et reste à **256 000 pixels** sur les périphériques à pointeur grossier. La carte initiale comporte **2 025 triangles**. Les modèles proches reçoivent la géométrie détaillée ; leurs versions intermédiaires et lointaines réduisent le coût. Les buffers de modèles GPU sont limités à **64 Mio**, avec éviction des poses les moins récemment utilisées ; leurs caches CPU sont également bornés en octets. Les buffers de carte sont réutilisés et ne sont reconstruits que lorsque la géométrie ou une texture de secteur change. F3 affiche les nombres de modèles et de triangles effectivement soumis. Aucune mesure FPS sur Xbox ou téléphone physique n’est revendiquée.

## Organisation

| Fichier ou dossier | Rôle |
|---|---|
| `src/e1m1-plan.js` | Paramètres d’architecture et de placements du plan fixe |
| `src/procedural-map.js` | Génération des cellules, géométrie et index spatial |
| `src/procedural-materials.js` | Dimensions et recettes de référence des matériaux |
| `src/procedural-surface-detail.js` | Cartes PBR continues, hauteurs et cache CPU des surfaces |
| `src/procedural-shaders.js` | Programmes monde, modèles, ciel, ombres et post-traitement |
| `src/procedural-lighting.js` | Sources locales, pulsations et projections des ombres |
| `src/procedural-raster.js` | Primitives de dessin des ressources |
| `src/procedural-mesh.js` | Primitives fermées, chanfreins, profils, normales, matériaux et transformations |
| `src/procedural-characters.js`, `src/procedural-anatomy.js` | Surfaces anatomiques et poses des trois familles d’ennemis |
| `src/procedural-objects.js` | Objets et projectiles 3D, trois niveaux géométriques |
| `src/procedural-remains.js`, `src/procedural-object-finish.js` | Corps et restes distincts suivant les références ; patine et rugosité calculées sur les objets |
| `src/procedural-weapons.js`, `src/procedural-object-sculpt.js` | Armes, surfaces implicites des mains et animation des pièces |
| `src/procedural-models.js` | Sélection des recettes, visibilité, niveaux de détail et groupes d’instances |
| `src/procedural-interface.js` | HUD et logo calculés, sans images de personnages ni d’armes |
| `src/procedural-resources.js` | Accès et comptage des ressources générées |
| `src/procedural-audio.js` | Synthèse des sons, composition et lecture musicales |
| `src/ferro-doom-renderer.js` | Adaptateur de rendu dans FERRO |
| `src/game.js` | Simulation, collisions, armes, ennemis et mécanismes |
| `src/app.js`, `src/input.js` | Interface, commandes, HUD et boucle du jeu |
| `tools/build.py` | Vérification de FERRO et assemblage du graphe runtime dans un HTML autonome |
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

Pour refaire l’inventaire de modèles : `node tools/measure-models.mjs > docs/qa/model-detail.json`.

Le rapport `docs/qa/validation.json` conserve le nombre réel de tests, la révision du build, sa taille et sa reproductibilité. Le journal TAP complet est dans `docs/qa/node-tests.txt`. Le test de build utilise une copie temporaire contenant uniquement le code, le moteur et l’interface : aucune archive n’est disponible. Il vérifie le fichier unique, l’intégration du CSS et des scripts, l’absence de ressource externe ou de média livré, la suppression des anciennes sorties, les empreintes FERRO et la reproductibilité. Les scripts exacts du HTML sont également exécutés dans une VM Node jusqu’au repli WebGL contrôlé ; ce test de liaison ne remplace pas une ouverture interactive du fichier.

Les tests de passes exécutent le véritable adaptateur avec un WebGL 2 simulé qui suit les ressources et les samplers : ils vérifient les cibles couleur/normales/profondeur, l’absence de lecture d’une texture attachée à la cible courante, le retour à la cible FERRO et la libération des buffers au redimensionnement et à la fermeture. Les tests d’éclairage vérifient notamment les portes, les pulsations des secteurs, les ombres hors champ et le cadrage de l’ombre des armes. La compilation et les pixels sont contrôlés séparément par EGL.

Les tests de commandes exécutent les gestionnaires de l’application avec un DOM et des périphériques simulés, la vraie carte générée et la vraie simulation. Les contrôles de synthèse audio portent sur les signaux, la spatialisation et le cycle de vie avec un contexte audio simulé.

Les tests de modèles vérifient les volumes, les normales, les poses, les limites de cache, les objets des trois difficultés et l’indépendance par rapport à la caméra. Ils contrôlent aussi la fermeture des nouvelles primitives, la conservation des coordonnées de matière lors des transformations, les limites du champ de vision, l’hystérésis des niveaux de détail et la libération effective des buffers GPU. Les tests de l’interface empêchent le retour d’une image de personnage ou d’arme par l’API du HUD.

Le script `python3 tests/render-egl.py` compile les dix shaders de production, lie cinq programmes et produit 39 images de contrôle en 1280 × 800 avec EGL/Mesa : niveau, armes au repos et en action, personnages de face/profil/dos, portraits, objets et corps en gros plan, porte ouverte et cinq états des passages secrets. Son rapport `docs/qa/egl-report.json` enregistre la géométrie, les niveaux de détail, les vues et les empreintes des modules utilisés. Les scènes de studio, de porte contenant un acteur et les caméras de secrets sont des placements contrôlés pour la vérification visuelle. Les hauteurs des secrets sont obtenues par les véritables actions utiliser/franchir puis la simulation, et chaque scène recharge son propre état complet. Les captures activent les ombres, les trois cartes de matière, les cibles de normales lisses, l’occlusion de contact et la passe dédiée à l’arme.

![Départ d’E1M1, rendu procédural de contrôle EGL](docs/qa/spawn-north-egl.png)

Ces images sont des **rendus OpenGL hors écran des shaders et données de production**, pas des captures de partie dans un navigateur. Le navigateur distant ne fournissait pas de contexte WebGL 2 lors du contrôle précédent ; l’accès au nouvel aperçu a ensuite été refusé par sa politique d’URL. La vérification interactive complète, le mixage audible, une manette physique et les performances sur téléphone/Xbox restent à confirmer sur ces appareils.

GitHub Actions n’a pas pu démarrer lors de la qualification précédente, à cause d’un blocage de facturation ou de plafond du compte. Les résultats locaux et EGL sont distincts de cette qualification distante. Le workflow conserve le contrôle `--check-committed` pour comparer les fichiers de `dist/` à un nouveau build.

## Référence et provenance

`reference/doom1.wad` est conservé comme archive de recherche, avec sa provenance, les anciens lecteurs et leurs tests séparés. Il n’est ni nécessaire au build, ni copié dans `dist/`, ni chargé par le jeu. L’outil `tools/export-e1m1-plan.mjs` permet de refaire le relevé architectural lors du développement.

La démarche de fidélité, les familles inspectées et les captures publiques de référence sont détaillées dans [les références visuelles](docs/visual-reference.md).

Taille de l’archive : **4 196 020 octets**. SHA256 : `1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771`.

- [Archive shareware de référence](https://ftp.fu-berlin.de/pc/games/idgames/idstuff/doom/win95/doom95.zip)
- [Source publiée des règles et formats Doom](https://github.com/id-Software/DOOM)
- Conditions shareware conservées dans `docs/DOOM-SHAREWARE-README.TXT`

Les données du plan et les marques Doom appartiennent à id Software et à leurs ayants droit. Les conditions de l’archive de référence sont distinctes de celles du code du jeu et du moteur FERRO.
