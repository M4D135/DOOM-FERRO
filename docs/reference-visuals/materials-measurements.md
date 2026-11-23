# Mesures et contrôle des matériaux

Ce fichier consigne les dimensions relevées dans `reference/doom1.wad` avec le lecteur de recherche `reference/wad.js`, puis les comparaisons effectuées pour les recettes de `src/procedural-materials.js` et `src/procedural-interface.js`. Il complète le compte rendu global du projet sans décrire les modèles 3D.

Les recettes reconstruisent les motifs par géométrie, éclairage et bruit déterministe. Aucun pixel extrait, palette extraite, bitmap de police, fichier image ou tableau de pixels encodé n’entre dans ces modules. **Les dimensions sont celles de la référence ; les images générées ne sont pas identiques pixel par pixel.** Les planches rendent les différences directement visibles.

## Dimensions des murs et du ciel

Les 36 noms ci-dessous ont été mesurés individuellement. Tous ont des origines de texture `leftOffset = 0`, `topOffset = 0`.

| Texture | Largeur × hauteur |
| --- | --- |
| BIGDOOR2 | 128 × 128 |
| BIGDOOR4 | 128 × 128 |
| BRNBIGC | 128 × 128 |
| BRNBIGL | 32 × 128 |
| BRNBIGR | 32 × 128 |
| BROWN1 | 128 × 128 |
| BROWN144 | 128 × 128 |
| BROWN96 | 128 × 128 |
| BROWNGRN | 64 × 128 |
| COMPSPAN | 32 × 128 |
| COMPTALL | 256 × 128 |
| COMPTILE | 128 × 128 |
| COMPUTE1 | 128 × 128 |
| COMPUTE2 | 256 × 56 |
| DOOR3 | 64 × 72 |
| DOORSTOP | 8 × 128 |
| DOORTRAK | 8 × 128 |
| EXITDOOR | 128 × 72 |
| EXITSIGN | 64 × 16 |
| LITE3 | 32 × 128 |
| NUKE24 | 64 × 24 |
| PLANET1 | 256 × 128 |
| SKY1 | 256 × 128 |
| SLADWALL | 64 × 128 |
| STARG3 | 128 × 128 |
| STARGR1 | 64 × 128 |
| STARTAN1 | 64 × 128 |
| STARTAN2 | 128 × 128 |
| STARTAN3 | 128 × 128 |
| STEP1 | 32 × 8 |
| STEP6 | 32 × 16 |
| SUPPORT2 | 64 × 128 |
| SW1STRTN | 64 × 128 |
| SW2STRTN | 64 × 128 |
| TEKWALL1 | 128 × 128 |
| TEKWALL4 | 128 × 128 |

La famille BRNBIG est ajourée. La référence contient 11 838 pixels opaques sur 16 384 pour BRNBIGC, 3 883 sur 4 096 pour BRNBIGL et 3 793 sur 4 096 pour BRNBIGR. Les recettes conservent des ouvertures transparentes dans ces trois ressources, sans prétendre reproduire le masque exact. Les autres murs générés sont opaques.

## Sols et plafonds

Les 23 images de référence inspectées ci-dessous font toutes **64 × 64**, avec origine `(0, 0)` :

`CEIL3_5`, `CEIL5_1`, `CEIL5_2`, `FLAT14`, `FLAT18`, `FLAT20`, `FLAT23`, `FLAT5_5`, `FLOOR1_1`, `FLOOR4_8`, `FLOOR5_1`, `FLOOR5_2`, `FLOOR6_2`, `FLOOR7_1`, `FLOOR7_2`, `NUKAGE1`, `NUKAGE2`, `NUKAGE3`, `STEP2`, `TLITE6_1`, `TLITE6_4`, `TLITE6_5`, `TLITE6_6`.

Le générateur accepte aussi `F_SKY1` comme ressource technique de 64 × 64 ; le rendu du ciel utilise `SKY1`.

L’agrandissement de FLOOR4_8 a servi à corriger la géométrie du pavage : les dalles à six côtés ont des limites de 48 × 32 unités, un pas horizontal de 32 et un décalage vertical de 16. Elles doivent se rejoindre. La première recette de cette révision laissait des intervalles ; cette erreur est corrigée dans la planche finale. Les reflets bombés et la corrosion verte clairsemée ont été rétablis. La fraction de pixels où le vert dépasse 1,3 fois le rouge est d’environ 3,4 % dans FLOOR4_8 original, 3,7 % dans FLOOR5_1 original et 3,8 % dans les deux recettes. Cette mesure globale contrôle une proportion, pas l’identité des pixels.

## Dimensions de l’interface

Les trois directions de regard ont été mesurées pour chaque niveau de santé.

| Ressource | Largeur × hauteur | leftOffset | topOffset |
| --- | --- | --- | --- |
| STBAR | 320 × 32 | 0 | 0 |
| STTNUM0, STTNUM2…9 | 14 × 16 | 0 | 0 |
| STTNUM1 | 11 × 16 | −1 | 0 |
| STTPRCNT | 14 × 16 | 0 | 0 |
| STYSNUM0…9 | 4 × 6 | 0 | 0 |
| STGNUM2…7 utilisés par le HUD original | 4 × 6 | 0 | 0 |
| STFST0[0…2], STFST1[0…2] | 24 × 29 | −5 | −2 |
| STFST2[0…2] | 24 × 30 | −5 | −2 |
| STFST3[0…2], STFST4[0…2] | 24 × 31 | −5 | −1 |
| STFOUCH0…4 | 24 × 31 | −5 | −1 |
| STFDEAD0 | 24 × 31 | −5 | −1 |
| M_DOOM | 123 × 60 | 0 | 0 |

Le STBAR de l’archive porte le libellé FRAG ; le jeu solo le remplace normalement par son panneau ARMS. La recette compose directement ARMS à cet emplacement, puisque le HUD courant ne superpose pas de ressource STARMS. Le fond est gris et le centre conserve sa transparence. Les grands chiffres sont des polygones rouges avec ombre, les petits chiffres des traits de 3 × 5 pixels plus leur ombre. Les dix valeurs de chaque famille sont distinctes. Le visage est découvert, avec cheveux bruns ; il ne porte plus le casque inventé dans la version précédente. `procedural-interface.js` refuse les noms de personnages, objets, armes et effets du monde.

## Planches finales

Chaque couple est présenté à la même échelle, avec la référence à gauche et la recette à droite. Pour les chiffres, la référence est au-dessus. Les images extraites n’existent que dans ces documents de contrôle ; le script ne crée aucun fichier sous `src/` ou `dist/`.

| Planche | Contenu |
| --- | --- |
| [materials-panels.png](materials-panels.png) | STARTAN/STARG, murs bruns |
| [materials-consoles.png](materials-consoles.png) | COMPUTE1/2, COMPTALL, PLANET1 |
| [materials-doors.png](materials-doors.png) | Grandes portes, porte simple, sortie |
| [materials-trim.png](materials-trim.png) | Grilles, lampes, marches, supports, interrupteurs, câblage |
| [materials-sky.png](materials-sky.png) | Relief rocheux sous ciel gris |
| [materials-flats-a.png](materials-flats-a.png) | Métal, pierre, pavage du départ |
| [materials-flats-b.png](materials-flats-b.png) | Roche, sol naturel, acide et éclairages |
| [materials-interface.png](materials-interface.png) | Barre d’état, chiffres, visages et logo |

Les planches ont été ouvertes et inspectées avec `view_image`. La comparaison a conduit aux corrections suivantes : dimensions non carrées rétablies, panneaux STARTAN arrondis et à reflets clairs, diagonales BRNBIG ajourées, consoles grises à écrans noirs, six écrans PLANET1, grandes portes gris/brun avec détails mécaniques, lampes LITE3 horizontales, panneau EXIT sur la moitié gauche, pavage jointif, suppression du quadrillage de FLAT5_5, BROWN144 sombre sans rainures inventées, marbrures NUKAGE déformées et HUD gris sans casque.

Les différences restantes sont visibles et assumées : détails mécaniques des portes et du câblage simplifiés, distribution de la corrosion différente, roche et montagnes calculées plutôt que photographiques, portraits et logo redessinés avec une géométrie plus simple, contours et texture de certains chiffres différents. Les recettes n’établissent donc pas une fidélité exacte au dessin de 1993.

## Reproduire les contrôles

La génération des planches requiert seulement pour la recherche l’archive optionnelle et Pillow :

```sh
python3 docs/reference-visuals/materials-compare.py
```

Les tests de régression ne lisent ni l’archive ni les planches :

```sh
node --test tests/procedural-materials.test.mjs tests/interface.test.mjs
```

Résultat exécuté : **9 tests réussis sur 9**, dont 7 nouveaux tests de matériaux et 2 tests de l’interface. Les contrôles portent sur les dimensions, la disponibilité de toutes les surfaces E1M1, la transparence des grilles, les changements locaux des interrupteurs, les trois phases d’acide, la structure et les couleurs du pavage, le déterminisme et l’absence de mécanisme de chargement ou d’image encodée. Ce résultat ne se substitue pas à la qualification du rendu 3D et du build menée séparément.
