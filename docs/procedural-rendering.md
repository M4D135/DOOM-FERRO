# Rendu procédural : matériaux, éclairage et budgets

Cette note décrit le chemin de rendu implémenté dans DOOM-FERRO. Le but est de rendre les volumes et les matières plus crédibles tout en conservant les motifs reconnaissables de Doom. L’emploi d’une BRDF physique, de cartes plus fines ou de davantage de géométrie ne démontre pas, à lui seul, que le photoréalisme est atteint. Les captures et les essais interactifs restent nécessaires pour apprécier le résultat.

Le code de référence est réparti entre [l’adaptateur FERRO](../src/ferro-doom-renderer.js), [les shaders](../src/procedural-shaders.js), [la construction de l’éclairage](../src/procedural-lighting.js) et [les recettes de surfaces](../src/procedural-surface-detail.js). Les fichiers de `vendor/ferro/` restent les copies canoniques du moteur. FERRO possède le contexte WebGL 2, la caméra, les cibles, le cycle de rendu et la compilation des programmes ; le projet dessine sa géométrie et ses passes dans son point d’entrée hôte.

## Matériaux et lumière séparés

Le modèle de surface utilise une couleur de base, une rugosité perceptuelle, un caractère métallique, une normale, une occlusion locale et une émission. Cette séparation correspond aux familles de propriétés décrites par [Khronos pour le PBR de glTF](https://www.khronos.org/gltf/pbr). Le rangement des canaux dans ce projet est toutefois propre au renderer : il ne constitue pas un fichier glTF ni un atlas métallique/rugosité au format glTF.

Les murs, sols et plafonds sont calculés dans trois tableaux RGBA indépendants :

| Tableau | R | G | B | A |
|---|---|---|---|---|
| `pixels` | Couleur de base sRGB, rouge | Vert | Bleu | Couverture |
| `normalRoughness` | Normale tangentielle X | Y | Z | Rugosité perceptuelle |
| `surface` | Caractère métallique | Occlusion locale | Émission | Hauteur |

La couleur de base entre dans le shader avec une conversion sRGB vers linéaire. Les normales, rugosités et masques sont des données numériques ; aucune conversion gamma ne leur est appliquée. Les grands reflets blancs de l’ancien dessin de matériau ne sont plus nécessaires pour suggérer un panneau bombé : les normales et la lumière donnent cette variation suivant le point de vue. Les graphismes affichés sur un écran restent naturellement des images de couleur et d’émission, sans transformer leurs caractères en bosses.

Les trois textures GPU utilisent `RGBA8`, une interpolation linéaire, des mipmaps trilinéaires et, lorsque l’extension existe, un filtrage anisotrope limité à 4. Ce filtrage réduit la perte de lisibilité aux angles rasants. Il ne faut pas le confondre avec une BRDF anisotrope : le lobe spéculaire du shader reste isotrope. Voir `_texture()` dans [l’adaptateur](../src/ferro-doom-renderer.js).

## GGX, Smith et Schlick

La fonction `brdf()` de [procedural-shaders.js](../src/procedural-shaders.js) emploie une distribution GGX, une visibilité Smith-GGX corrélée en hauteur et l’approximation de Fresnel de Schlick. Ces trois choix, ainsi que le terme diffus lambertien, sont documentés dans le modèle standard de [Filament](https://google.github.io/filament/main/filament.html). GGX règle la distribution des reflets ; Smith représente le masquage entre microfacettes ; Schlick fait varier la réflexion avec l’angle de vue.

Pour une rugosité perceptuelle `r`, l’implémentation utilise `alpha = max(0.035, r*r)`. La réflexion à incidence normale vaut `mix(F0, baseLinear, metal)`. La fonction additionne ensuite un terme diffus `baseLinear / pi`, pondéré par `(1-F) * (1-metal)`, et le terme spéculaire `D * visibility * F`, puis applique le cosinus d’incidence. Les bornes numériques évitent les divisions singulières.

Le `F0` diélectrique courant vaut `0.04` ; la peau et le verre utilisent respectivement `0.028` et `0.025` dans cette implémentation. Ce sont des paramètres de rendu du projet. Ils ne proviennent pas de mesures des matériaux historiques de Doom. Le verre reste opaque dans ce chemin : sa rugosité et sa réflexion sont distinctes, sans transmission ni réfraction volumique.

Les maillages possèdent leurs propres attributs de matière et coordonnées locales, définis dans [procedural-mesh.js](../src/procedural-mesh.js). Le shader calcule notamment pores, trame du tissu, grain du cuir, brossage du métal, peinture, os, bois et sang à partir de ces coordonnées. Les détails suivent donc la pièce lorsqu’elle s’anime. Les paramètres de matière sont interpolés dans chaque triangle ; les champs de patine et de rugosité par sommet ne créent pas de taches triangulaires. La rugosité des restes organiques respecte la recette du maillage, afin de distinguer sang sec, tissus et surfaces plus humides. Les dérivées écran atténuent les motifs devenus trop fins ; leur contribution à la normale est bornée. La peau reçoit un petit terme diffus élargi et le tissu une faible réponse aux angles rasants. Ces deux ajouts sont des approximations locales, sans simulation du transport de lumière dans la matière.

## Recettes HD et fidélité aux motifs

`surfaceDetail(kind, name, baseResource, {maxSize})` évalue des formes continues dans les unités de la texture d’origine. Les dimensions historiques restent dans `baseWidth` et `baseHeight` et commandent la répétition des UV. Une texture `128 × 128` peut ainsi fournir une carte `512 × 512` sans agrandir le motif dans le niveau. Les ressources basse résolution de [procedural-materials.js](../src/procedural-materials.js) conservent leurs dimensions et leurs tableaux d’origine.

Les recettes connues utilisent des distances à des formes, des profils de plis, des cylindres projetés, des encadrements, des joints et des variations déterministes de matière. Aucun pixel extrait du WAD, modèle importé, photographie ou média encodé n’est chargé par ce module. Les documents de [référence visuelle](visual-reference.md) et les [mesures des matériaux](reference-visuals/materials-measurements.md) décrivent la recherche distincte du runtime.

| Famille | Caractéristiques conservées et traitement du relief |
|---|---|
| STAR / STARTAN | Colonnes de 32 unités, alternance gris/tan/olive, petits en-têtes et grandes tôles, bandes aux mêmes hauteurs ; jeux étroits, petits chanfreins et plis verticaux peu profonds |
| BIGDOOR / DOOR3 / EXITDOOR | Rails, pistons, circuits mécaniques, verrou, jauge et bandes de sécurité aux positions caractéristiques ; différenciation du métal, des creux et des petits voyants |
| COMPUTE / COMPTALL / PLANET1 | Répartition des écrans, commandes et circuits ; graphismes calculés, verre presque plat et émission localisée |
| BROWN / BRNBIG | Ton brun ou vert, corrosion fine et coulures orientées ; découpes transparentes des grilles préservées |
| FLOOR4_8 / FLOOR5 | Pavage à six côtés jointifs, avec profondeur du joint, grain minéral et traces d’oxydation localisées |
| TLITE / STEP2 | Diamants centraux ou quatre petites lampes circulaires selon le motif ; deux grilles brunes dans leur cadre gris pour STEP2 |
| NUKAGE | Trois phases déterministes distinctes, couleur verte, faible rugosité et relief ondulé correspondant à chaque phase |

La hauteur de la carte se décode par `h = (A/255 - 0.5) * heightScale`, en unités Doom. Les normales sont dérivées du champ de hauteur temporaire avant quantification, avec les différences rapportées au nombre d’unités Doom par texel. Leur axe tangent Y suit le V de l’image ; elles incluent déjà cette échelle physique. Le shader reconstruit la base tangentielle à partir des dérivées de la géométrie et des UV, puis renormalise la normale filtrée.

Le profil STAR a été resserré après examen du rendu : des gouttières larges et des coins très arrondis faisaient lire des panneaux plastiques séparés par une grille noire. La recette actuelle utilise un jeu d’environ `0.7` unité entre colonnes, un chanfrein principal de `0.48`, des coins de `0.8` et un relief de grande tôle de `0.16`. Ces valeurs décrivent une reconstruction physique du dessin, sans prétendre retrouver une géométrie 3D originale qui n’était pas fournie par l’asset.

## Relief apparent et géométrie

Le shader de monde applique, dans le profil détaillé et à moins de 15 unités de scène, une recherche de parallaxe bornée à dix étapes avec interpolation du dernier intervalle. Le décalage UV dépend de `heightScale / baseWidth` et de `heightScale / baseHeight`. L’angle rasant est borné pour limiter l’allongement du motif. Cette opération ne déplace ni les triangles, ni la profondeur écrite, ni les collisions : les silhouettes, intersections et ombres fines ne deviennent pas celles d’un maillage déplacé.

Les personnages, armes et objets restent des maillages procéduraux instanciés. Leurs formes importantes sont géométriques ; la modulation de matière ajoute un détail plus fin à leur normale. Le ciel suit une passe séparée de nuages et reliefs calculés, sans carte PBR de surface. Voir les programmes `WORLD_FRAGMENT`, `MODEL_FRAGMENT` et `SKY_FRAGMENT` dans [les shaders](../src/procedural-shaders.js).

## Éclairage local, émissions et indirect

[procedural-lighting.js](../src/procedural-lighting.js) construit des positions lumineuses depuis les secteurs et leurs cellules. Les plafonds lumineux, ouvertures vers le ciel, lampes murales LITE, écrans COMP, sols NUKAGE et faible remplissage des pièces fournissent des candidats distincts. Les lampes et écrans sont placés sur leurs véritables pans de mur, décalés de quatre unités à l’intérieur de leur secteur ; les sources des liquides restent six unités au-dessus de leur sol. Leurs hauteurs suivent les secteurs mobiles. Le remplissage d’un plafond ordinaire est plafonné à 3,2 unités de puissance pour éviter les taches spéculaires d’une lampe fictive au centre de chaque pièce. Les lampes du monde, projectiles, explosions et éclairs de bouche peuvent compléter cette liste. Au plus six lumières sont envoyées au shader.

Les candidats sont classés selon leur puissance et leur distance à l’œil. `lightPathOpen()` rejette ceux dont le segment vers le joueur traverse un mur plein ou une ouverture fermée par les hauteurs courantes d’un secteur. Ce contrôle tient donc compte d’une porte qui s’ouvre. Il est effectué depuis la position du joueur : il ne remplace pas une visibilité par fragment pour chacune des six lumières, et des fuites de lumière restent possibles près des séparations.

`sectorLightPulse()` applique les clignotements, variations rapides et pulsations des secteurs à la puissance directe de leurs sources. Les mêmes formes temporelles modulent la contribution sectorielle dans le shader. Le classement des sources conserve leur puissance de base, avant cette modulation : un clignotement ne fait donc pas basculer à lui seul la caméra d’ombre d’un luminaire à l’autre. Un déplacement du joueur ou une autre évolution de la scène peut toujours changer la source primaire sélectionnée.

La contribution directe décroît avec la distance selon un facteur `1 / (1 + d*d)` et une extinction progressive à la portée de la source. Les couleurs et puissances sont réglées pour le niveau et ses secteurs. Il ne s’agit pas d’un étalonnage photométrique en lumens ou en candelas.

L’indirect est une approximation hémisphérique : un dégradé dépendant de la normale pour le diffus et un autre dépendant de la direction réfléchie pour le spéculaire. L’éclairement du secteur et la présence du ciel le modulent. Il n’existe pas de calcul des rebonds de la scène, de sondes d’environnement capturées ni d’intégration d’une cubemap préfiltrée. L’émission ajoute directement de la lumière à la couleur du fragment ; les lampes capables d’éclairer leur voisinage sont représentées séparément par les sources locales. Une carte d’émission n’engendre donc pas automatiquement un éclairage global.

## Ombres et occlusion

Le renderer produit une carte de profondeur projective du monde pour la première lumière retenue. Elle mesure `1024 × 1024` dans le profil détaillé et `512 × 512` dans le profil compact. Les textures d’ombre utilisent `sampler2DShadow`, une comparaison `LEQUAL` et un filtrage `LINEAR`. La grille PCF `3 × 3` moyenne donc neuf lectures de comparaison déjà filtrées bilinéairement. Un décalage normal et un biais dépendant de l’incidence limitent l’auto-ombrage parasite. Les autres sources locales ne possèdent pas de shadow map. La projection du monde suit une cible devant la caméra ; ce n’est ni une ombre omnidirectionnelle complète ni un ensemble de cascades.

Les murs, sols et plafonds participent à cette passe, avec un test alpha qui conserve les ouvertures des grilles. Pour les objets, `collectShadowBatches()` dans [procedural-models.js](../src/procedural-models.js) réutilise exactement les maillages, poses et instances déjà visibles. Il ajoute des objets hors du frustum de la caméra lorsqu’ils sont proches de la lumière et dans son cône de projection. Ces ajouts sont bornés par la portée de la source, augmentée d’une marge de 2,5 unités de scène, et leur détail est plafonné au niveau moyen `LOD 1`. Un objet proche peut ainsi continuer à projeter une ombre visible lorsqu’il sort de l’image. Le relief par parallaxe ne modifie pas la géométrie de cette passe.

Les mains et l’arme tenue disposent d’une seconde carte d’ombre de `512 × 512`, dans les deux profils. `weaponShadowProjection()` ajuste sa projection au volume visible de l’arme et des mains, avec une marge, en réutilisant les buffers de la pose courante. La passe d’ombre dessine tous leurs triangles. Cette projection resserrée réserve davantage de texels aux contacts entre les doigts et les pièces de l’arme que la grande projection du monde. Lors du seul dessin de l’arme en vue interne, le shader multiplie la visibilité issue de la carte du monde par celle de cette carte dédiée. Le monde ne reçoit pas les ombres de ce modèle de vue. Ces choix sont visibles dans `_shadowPass()`, `_renderPass()` et `_lightingUniforms()` de [l’adaptateur](../src/ferro-doom-renderer.js).

Deux mécanismes d’occlusion sont complémentaires. La carte de matière contient une occlusion analytique des joints et cavités ; elle module l’indirect. Dans le profil détaillé, une seconde passe estime les contacts depuis la profondeur écran, avec douze échantillons et un rayon de scène borné. Elle lit une cible supplémentaire `RGBA8` contenant les normales en espace monde : normale géométrique des surfaces du niveau et normale lisse interpolée des modèles, avant leur microrelief. La passe transforme cette normale dans le repère de vue au lieu de reconstruire une normale de triangle depuis les dérivées de profondeur. Cela évite que l’occlusion réintroduise les facettes de la triangulation sur un modèle à normales lissées.

La fraction indirecte, enregistrée dans l’alpha de la couleur intermédiaire, limite le poids de ce second assombrissement. Comme il s’applique à la couleur déjà composée et transformée, il reste une approximation : ce n’est pas une intégration séparée de tous les chemins lumineux. Les surfaces hors écran et cachées au tampon de profondeur ne peuvent pas être reconstruites par l’occlusion de contact, même si certains objets hors écran participent désormais aux ombres de la lumière primaire.

## Présentation de l’image

L’ambiance combine un éclairage indirect plus froid, des plafonds fluorescents moins chauds, un ciel couvert plus sombre et une atténuation de distance. La brume analytique utilise `1 - exp(-densité * max(distance - 3, 0))`, avec une densité de `0,014` à l’intérieur et `0,009` à l’extérieur, dans les unités de scène. Elle est désactivée dans les vues de studio pour inspecter les modèles. Ce mélange en espace linéaire ne représente ni des particules, ni une diffusion volumétrique physique ; il n’ajoute aucun sprite.

Les contributions sont additionnées en espace linéaire, multipliées par le réglage de luminosité, puis comprimées par une courbe filmique rationnelle et reconverties en sRGB. La cible de scène possède deux attachements `RGBA8`, l’un pour la couleur composée et l’autre pour les normales, accompagnés d’une profondeur `DEPTH_COMPONENT24`. La conversion filmique intervient avant le stockage de la couleur ; les normales restent des données numériques. Ce chemin ne conserve donc pas une image HDR flottante complète pour le post-traitement et ne comporte pas d’exposition automatique.

Une passe de présentation lisse certains contrastes de contour à partir de voisins proches. Il n’y a pas d’accumulation temporelle, de MSAA, de bloom ou de réflexions écran activés dans ce chemin. L’intensité des écrans et lampes doit rester lisible sans dépendre d’un halo ajouté. Ces réglages sont décrits par `POST_FRAGMENT` et l’appel final à `engine.draw()`.

## Budget mémoire et profils

Le générateur conserve au plus **48 Mio** de tableaux de surfaces et de travail directement retenus. Le cache LRU évince avant une nouvelle allocation, en comptant le champ temporaire de hauteur `Float32` en plus des trois cartes RGBA. Les statistiques `bytes` et `peakWorkingBytes` exposent respectivement les cartes retenues et le maximum de cet ensemble de travail. Ce budget ne désigne pas la mémoire totale du processus : ressources de base, géométrie, programmes, allocations du moteur et récupération différée du ramasse-miettes sont distincts.

L’adaptateur conserve seulement les handles GPU et les métadonnées après upload. Retenir aussi les trois tableaux dans son cache de textures empêcherait le LRU CPU de libérer ces références. Les cartes d’un matériau restent limitées à 524 288 pixels chacune et à une dimension maximale de 1024. Le cache GPU des surfaces conserve les matériaux créés ; il n’est pas un LRU équivalent au cache CPU.

Les tailles suivantes ont été comptées pour **56 matériaux d’E1M1** : 33 textures murales et 23 flats, avec les trois phases NUKAGE et les variantes de switch activé, sans le ciel. Elles comprennent les trois cartes RGBA8 et chaque niveau de mipmap jusqu’à `1 × 1`.

| Plafond de dimension | Mémoire des trois cartes et mipmaps |
|---|---:|
| 1024 | **178,188 Mio** |
| 512 | **163,563 Mio** |
| 256 | **42,109 Mio** |

Le calcul additionne `12 * largeur * hauteur` pour chaque niveau, en divisant chaque dimension par deux, arrondie vers le bas et bornée à un. Il s’agit des octets de texels des surfaces, hors alignement éventuel du pilote, cibles de couleur, normales et profondeur de scène, deux shadow maps et buffers de maillages. L’attachement des normales représente à lui seul quatre octets supplémentaires par pixel de la vue. Le compteur de l’adaptateur utilise l’approximation usuelle `12 * largeur * hauteur * 4/3` ; les valeurs du tableau utilisent les chaînes entières. La limite séparée du cache de maillages est de 64 Mio dans l’adaptateur.

Le profil compact est choisi lorsque `maxPixels <= 640*400`. Il plafonne les cartes à 256, réduit la shadow map du monde à 512 et désactive la parallaxe et l’occlusion de contact écran. Le profil détaillé plafonne les cartes à 1024, utilise une shadow map du monde de 1024 et active ces deux effets. La carte d’ombre dédiée à l’arme reste à 512. Les normales, rugosités et lumières locales restent présentes dans les deux profils ; l’attachement des normales de scène est actuellement alloué dans les deux cas, même lorsque l’occlusion de contact est désactivée.

`prepareModels()` préchauffe les surfaces et certains modèles avec une progression, en rendant la main entre recettes via `requestAnimationFrame`. Une recette reste synchrone ; ce découpage ne déplace pas sa génération dans un worker. Ces budgets et ce comportement de chargement ne constituent pas une mesure de FPS ni une garantie de fluidité sur un appareil physique.

## Vérification et portée des résultats

[procedural-surface-detail.test.mjs](../tests/procedural-surface-detail.test.mjs) vérifie la présence et la taille des cartes, les dimensions de référence, le déterminisme, l’intégrité des ressources sources, les normales, leur relation au relief, les matériaux distincts, les émissions localisées, les découpes, les phases du liquide et le budget LRU. Ces contrôles vérifient des invariants ; ils ne jugent pas l’anatomie, la fidélité d’une silhouette ou la qualité photographique d’une image.

Les captures doivent être produites par les shaders de production avec leurs matériaux effectifs. Une planche d’albedo, de normale, de rugosité ou de hauteur sert à comprendre une recette ; elle ne doit pas être présentée comme une capture jouable. De même, un rendu natif EGL permet d’examiner les formes et la lumière sans démontrer, à lui seul, les commandes, les collisions, l’ouverture des portes ou le comportement d’un navigateur. Le rapport de validation et la livraison doivent distinguer ces vérifications.

## Sources techniques primaires

- [Filament — Physically Based Rendering in Filament](https://google.github.io/filament/main/filament.html) : modèle microfacette standard, distribution GGX, visibilité Smith corrélée, Fresnel de Schlick et séparation des termes d’éclairage.
- [Khronos — Physically Based Rendering in glTF](https://www.khronos.org/gltf/pbr) : sens des propriétés couleur de base, métal, rugosité, normale, occlusion et émission. Le projet utilise ses propres recettes et son propre rangement de canaux.
- [Shaders de production du projet](../src/procedural-shaders.js), [adaptateur FERRO](../src/ferro-doom-renderer.js), [éclairage local](../src/procedural-lighting.js) et [générateur de surfaces](../src/procedural-surface-detail.js) : sources des comportements, approximations et limites décrits ici.
