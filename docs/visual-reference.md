# Références visuelles et reconstructions procédurales

La demande est de conserver les designs reconnaissables du premier Doom et de les construire par le code, avec des objets et personnages réellement en 3D. Les recettes s’appuient sur les assets PC de l’archive de recherche et sur des captures publiques du jeu. Aucun pixel extrait, modèle externe, atlas encodé ou lecteur WAD n’entre dans le graphe runtime.

## Référence primaire inspectée

`reference/doom1.wad` contient les textures, les flats et les dessins d’origine utilisés pendant le développement. Les vues avant, trois quarts, profil et dos des personnages ont été ouvertes pour comparer les proportions et les éléments distinctifs. Les objets et les poses des armes ont également été examinés.

| Famille originale | Caractéristiques conservées dans la recette |
|---|---|
| POSS | Cheveux verts courts, épaules beige/gris, pantalon kaki, blessures rouges, fusil oblique |
| SPOS | Crâne chauve, tenue sombre, bottes rouges, fusil à pompe |
| TROO | Imp brun voûté, mâchoire ouverte et dents, pointes aux épaules et aux membres |
| BAR1 | Baril vert métallique, bandes horizontales, surface toxique au sommet |
| COLU / ELEC | Lampe noire à anneau jaune et colonne technique à câbles |
| BON1 / BON2 | Flacon bleu et petit casque gris |
| ARM1 / ARM2 | Plastrons vert et bleu avec épaules saillantes |
| STIM / MEDI | Boîtes grises avec croix rouges |
| CLIP / AMMO / SHEL / SBOX / SHOT | Chargeur, caisse de munitions, cartouches, boîte de cartouches et fusil posé au sol |
| PISG / SHTG / PUNG | Pistolet noir arrondi, fusil noir et bois, mains brunes et poing ; poses reconstruites en 3D |
| STBAR / STF / STTNUM / M_DOOM | Barre grise, visage sans casque, chiffres rouges, logo bleu au-dessus et doré en dessous |

Les textures gardent leurs dimensions de référence, notamment COMPUTE2 en 256 × 56, DOOR3 en 64 × 72, BRNBIGL/R en 32 × 128 et SKY1 en 256 × 128. Les grilles BRNBIGC/L/R conservent des ouvertures transparentes. Les motifs sont reconstruits avec des aplats, des formes, des reliefs analytiques et du bruit déterministe.

## Captures publiques consultées

- [Galerie de captures du Doom shareware, avec vues d’E1M1](https://www.gamers.org/games/doom/screens.html).
- [Index des vues de départ des niveaux PC](https://doomclassic.com/maps/d1fpvs/d1.htm).
- [Vue de la première salle d’E1M1](https://eeggs.com/items/102.html).
- [Article illustré de captures du Doom original](https://oramind.com/blog/remembering-the-original-doom-game/).

Une [longplay de Doom de 1993](https://www.youtube.com/watch?v=OiwsGy70OII) a été identifiée lors de la recherche. Son contenu vidéo n’a pas pu être consulté dans cet environnement ; elle n’est pas présentée comme une source visionnée.

## Portée de la reconstruction

Les dessins de personnages de Doom fournissent plusieurs projections d’une silhouette. Ils ne constituent pas des modèles 3D que l’on pourrait reprendre tels quels. Les volumes entre ces vues, les articulations et certaines surfaces masquées doivent être reconstruits. Le résultat vise les mêmes designs et couleurs, sans revendiquer une correspondance pixel par pixel. La version 0.4.0 enrichit les formes proches et conserve des variantes plus compactes à distance.

Le maillage d’un personnage reste identique lorsque la caméra en fait le tour. Seuls sa position, son orientation propre et sa pose d’animation le transforment. Les effets, cadavres, objets et armes en main suivent le même principe de volumes triangulés. Le HUD conserve son rôle d’interface 2D.

Les images de `docs/qa/` sont produites par les shaders et données de production dans un contexte natif EGL/Mesa. Elles servent à examiner la géométrie et les matériaux ; elles ne prouvent pas une session interactive dans un navigateur ni les performances d’un appareil physique.

## Reprise du détail en 0.4.0

L’examen porte maintenant sur les portraits, les vues de profil et de dos, les petits objets en trois quarts et les armes pendant le tir et le pompage. Le détail est construit dans les volumes : profils du torse et du crâne, paupières, cavités buccales, dents séparées, doigts, plis, coutures, chanfreins, collerettes et mécanismes. Les textures de murs, le plan et la palette de référence n’ont pas été remplacés pour cette reprise.

L’éclairage tient compte des normales, de la rugosité et du caractère métallique des surfaces. Les petits motifs de matière sont calculés dans le repère local de chaque primitive ; ils suivent donc les pièces animées. L’usure reste légère pour préserver la lecture des designs originaux. Les images de contrôle sont calculées en 960 × 600 pour examiner ces détails ; le jeu garde un budget inférieur sur les appareils à pointeur grossier.

Les trois niveaux de géométrie reprennent les mêmes proportions, la même pose et la même orientation. Les contrôles automatisés complètent l’examen des images en vérifiant les normales, les volumes, les matériaux, le maintien des ancrages et les limites de mémoire. L’ajout de triangles ne constitue pas à lui seul un critère de fidélité ; la comparaison des silhouettes et des détails distinctifs reste nécessaire.


## Reprise des surfaces et du modelé en 0.5.0

Les mêmes assets hors runtime servent de référence aux proportions, palettes et motifs. Les volumes entre les vues sont reconstruits : surfaces anatomiques continues, mains fusionnées, parois internes d’objets et assemblages d’armes. Les cartes PBR sont évaluées à partir de fonctions continues ; elles ne sont pas un agrandissement de pixels extraits. Les petits profils de tôle, joints et chanfreins STAR ont été réduits après examen des vues natives pour éviter un aspect de grille plastique.

Le contrôle final comporte 31 vues EGL à 1280 × 800, dont trois portraits, neuf angles de personnages et huit gros plans d’objets. Les ombres ont été examinées activées et désactivées pendant le développement pour distinguer les défauts géométriques des défauts de filtrage. Les captures livrées activent le chemin complet. Leur rapport et les empreintes de toutes les sources sont dans `docs/qa/egl-report.json`.

Les personnages demeurent des reconstructions stylisées ; ni les comptes de triangles, ni les modèles physiques des matériaux ne constituent une preuve de photoréalisme. Les limites du rendu sont décrites dans [procedural-rendering.md](procedural-rendering.md).
