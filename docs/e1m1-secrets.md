# E1M1 — fidélité des trois secrets et parcours jouable

Audit du 24 novembre 2026. Référence : **Doom shareware 1.9**, carte `E1M1`, dans l'archive de recherche `reference/doom1.wad` ; SHA-256 `1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771`.

## Plan vérifié

La comparaison directe du lecteur de référence avec `createE1M1Map()` vérifie les coordonnées de chaque extrémité des 475 linedefs, leurs flags, actions et tags, les 648 sidedefs complets, les 85 secteurs et les 138 placements d'objets. Tous correspondent à l'archive. Les 385 sommets architecturaux utiles sont conservés ; les sommets produits par le BSP original ne sont pas importés. Les sols, plafonds et cellules de collision restent reconstruits par le générateur procédural.

L'archive choisie contient exactement trois secteurs de type 9 : **68, 69 et 70**. La cour extérieure et la galerie haute sont les destinations de deux secrets, mais ce sont respectivement la porte 68 et la plateforme 70 qui portent le compteur. Il ne faut donc pas déplacer le compteur dans la cour, l'attribuer à toute la galerie, ou ajouter des passages provenant d'une autre édition du niveau. Le WAD reste hors du runtime et du build ; les nouveaux tests fonctionnent sans `reference/`.

## Accès, hauteurs et retour

Toutes les coordonnées et hauteurs ci-dessous sont exprimées en unités Doom. Les identifiants de lignes et secteurs commencent à zéro, comme les tables du projet.

| Secret | Déclenchement exact | Géométrie et récompense | Retour |
| --- | --- | --- | --- |
| **68 : porte vers la cour** | Utiliser la face 247, à `x=2944`, entre `y=-3904` et `-3776`. Type 1 ; flag 32 sur la face cachée. La face de retour 248, à `x=2912`, est une porte ordinaire. | Sol `-24`, plafond initial `-24`, plafond ouvert `44` : 68 unités de passage pour un joueur de hauteur 56. Le souterrain rejoint la cour et la méga-armure à `(1824,-3280)`, au fond du bassin, sol `-80`. | Le bassin remonte sur le sol extérieur `-56` par une marche de 24. Le souterrain comporte des marches de 16 et rejoint la porte par la face 248. Elle peut être rouverte après sa fermeture. |
| **69 : alcôve du fusil** | Franchir la ligne 308, de `(2912,-4160)` à `(3104,-4160)`, à l'entrée de la salle avant la sortie. Type 36, tag 1, à usage unique et réservé au joueur. | Le secteur 59 descend de `96` à `-40`, à 140 unités/s, soit le sol voisin `-48` plus 8. Le passage 58 puis l'alcôve 69 sont au sol `-48`. Le plafond de l'alcôve est `32`, soit 80 unités de hauteur. Fusil à `(3264,-3936)`, boîte de cartouches à `(3264,-3856)`, trousse à `(3232,-3808)`. | Le chemin se reprend dans l'autre sens, avec seulement 8 unités à remonter sur le secteur 59. Son abaissement est permanent. |
| **70 : plateforme minutée** | Franchir la ligne 195, de `(2752,-3048)` à `(3048,-2880)`, au débouché de la salle des ordinateurs vers le zigzag. Type 88, tag 2, réutilisable, activable aussi par un monstre. | La plateforme descend de `104` à `-48`, à 140 unités/s, attend 3 secondes, puis remonte à `104`. Il faut avoir ouvert le passage précédent et courir vers la petite plateforme de 64 × 64, centrée en `(3552,-3872)`. La galerie 62 reste à `104` et contient la boîte de cartouches 129 et les huit bonus d'armure 130–137. | La galerie fait le tour est du bassin et débouche sur la fenêtre, ligne 464, pour redescendre dans le zigzag. À l'arrêt haut, le plafond du couloir 58, à `104`, ferme le passage vers l'alcôve : le retour normal se fait par la fenêtre. Rater un cycle n'annule pas le secret : la ligne 195 le redéclenche après le retour en haut. |

La face 247 conserve le motif **BROWN96** et son décalage vertical original de 72 ; les faces 248, 431, 465 et 466 conservent leurs paramètres originaux. Le repère discret de la porte cachée ne doit pas devenir une porte ordinaire ajoutée au milieu du mur. Le secteur 59 et les passages orientaux utilisent **BROWNGRN**. Ces noms sélectionnent les recettes procédurales du projet, sans charger les images du WAD.

## Règles corrigées

Le comptage exige désormais que le joueur ait rejoint le sol du secteur secret. Traverser son volume en chute ne suffit plus. Le compteur reste unique par secteur et se réinitialise au redémarrage. Cette condition correspond à `P_PlayerInSpecialSector` dans [p_spec.c d'id Software](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_spec.c).

Les monstres peuvent maintenant déclencher le type 88 en traversant la ligne 195. Ils ne peuvent ni déclencher ni consommer la ligne 308 de type 36. Cette distinction est définie par `P_CrossSpecialLine` dans le même [p_spec.c](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_spec.c). Le mouvement continue de respecter les flags de collision, notamment les bords du zigzag qui bloquent les monstres.

L'IA ne peut plus ouvrir la face marquée `ML_SECRET` de la porte de la cour ; les portes ordinaires et la face de retour restent utilisables. Elle ne peut pas refermer volontairement une porte qui monte ou attend. Ces règles proviennent respectivement de `P_UseSpecialLine` dans [p_switch.c](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_switch.c) et de `EV_VerticalDoor` dans [p_doors.c](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_doors.c).

Les hauteurs et temporisations existantes ont été vérifiées contre `turboLower` dans [p_floor.c](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_floor.c), `downWaitUpStay` dans [p_plats.c](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_plats.c) et les constantes de [p_spec.h](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_spec.h). La course vers le secret 70 n'a pas été simplifiée par une attente prolongée, un déplacement de son déclencheur ou une vitesse spéciale.

Les démarrages, arrêts et changements de direction des portes et plateformes émettent maintenant leur son à la position du secteur mobile. Pour le secret 70, l'origine est `(3552,-3872)` ; elle n'est plus attachée à la ligne 195 distante ni au joueur. L'origine horizontale est le centre des limites du secteur, conformément à `P_GroupLines` dans [p_setup.c](https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_setup.c). La coordonnée verticale suit le sol mobile pour la spatialisation 3D du projet. Les sons eux-mêmes restent synthétisés.

## Preuve de parcours, sans téléportation

Le test principal de `tests/e1m1-secrets.test.mjs` commence au départ officiel `(1056,-3616,0)`, en difficulté moyenne. Il pilote uniquement `game.update` par marche, course, déplacement latéral, visée, tirs et utilisation. Il ne supprime aucun acteur, ne désactive aucune collision et ne modifie ni santé, ni munitions, ni positions, ni hauteurs des secteurs.

Le parcours vérifie successivement :

1. Les salles initiales, leur porte, le zigzag, la porte secrète et les marches du souterrain jusqu'à la cour ; la méga-armure est ramassée à son emplacement original.
2. Le retour par les mêmes marches, puis la face intérieure de la porte, après sa fermeture.
3. La salle avant la sortie pour déclencher 308, le retour vers le secteur 59 abaissé, puis le fusil de l'alcôve 69.
4. Le retour au déclencheur 195, puis une course d'environ **3,73 secondes** vers la plateforme, avec un délai inférieur à 4 secondes dans le test.
5. La montée réelle du joueur, la boîte de cartouches et les huit bonus de la galerie, puis la chute à travers la fenêtre jusque dans le bassin.
6. Le retour au chemin principal et l'activation du commutateur de sortie, avec **3/3 secrets et les 6 ennemis originaux éliminés par les tirs du joueur**. Les barils originaux restent présents.

Les cinq autres tests isolent la découverte au contact du sol, les droits des monstres sur les déclencheurs, le flag de porte secrète, le cycle manqué puis redéclenché de la plateforme, et l'origine des sons sur les deux faces de la porte. Ces tests unitaires placent leurs acteurs pour isoler un mécanisme ; ils sont distincts du parcours intégral, qui n'utilise aucun placement artificiel.

Commande ciblée :

```sh
node --test tests/e1m1-secrets.test.mjs tests/game.test.mjs
```

La validation de simulation ne se substitue pas à une visite visuelle dans FERRO ou au navigateur.

## Positions pour la vérification visuelle

Ces positions servent à capturer des vues de contrôle. `z` désigne les pieds du joueur ; la caméra normale du jeu ajoute sa hauteur de regard. Les angles sont en radians, `0` vers l'est et `π` vers l'ouest.

| Vue | Position des pieds | Orientation | Préparation cohérente |
| --- | --- | --- | --- |
| Porte cachée fermée, puis ouverte | `(2988,-3840,-24)` | `π` | État initial ; utiliser la porte puis simuler 1 s. Le plafond 68 passe à 44. |
| Alcôve du fusil | `(3424,-3856,-48)` | `π` | Franchir 308 puis simuler 1,2 s pour atteindre le sol `-40` du secteur 59. Les secteurs 58/69 ne changent pas de hauteur. |
| Plateforme abaissée | `(3488,-3872,-48)` | `0` | Après l'ouverture du passage 59, franchir 195 puis simuler 1,2 s. Le secteur 70 est à `-48`, le secteur 62 reste à `104`. |
| Montée dans le secret | `(3552,-3872,-48)` au départ | `0` | Entrer pendant l'attente basse et laisser le moteur porter le joueur. La hauteur finale est `104` ; ne pas aplatir la galerie pour obtenir l'image. |
| Galerie supérieure | `(3648,-3808,104)` ou `(3616,-3504,104)` | `π/2` | Plateforme revenue à 104. Les récompenses restent à leurs emplacements d'origine si elles n'ont pas été collectées. |

Pour une capture isolée, préparer les mécanismes avec leurs actions et une simulation réelle des mouvements. Une simple modification du plafond ou du sol dans le tableau peut produire un état que le joueur ne pourrait jamais atteindre, notamment au contact entre le couloir bas 58, la plateforme 70 et la galerie haute 62.
