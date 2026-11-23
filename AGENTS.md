# DOOM-FERRO

- Objectif : reconstruire E1M1 dans FERRO avec un runtime entièrement procédural, conformément à la demande explicite de l’utilisateur. La géométrie est générée depuis les paramètres du plan fixe ; textures, HUD, sons et musique sont calculés par le code. Les personnages, objets, décors, effets et armes sont de vrais maillages 3D procéduraux, avec profondeur et orientation propres ; aucun billboard dans le monde ou pour l’arme tenue.
- Aucun WAD, image, modèle ou enregistrement sonore importé dans le runtime ou dans `dist/`. Ne pas remplacer ces fichiers par des blobs encodés. Les tables du plan décrivent l’architecture et les placements ; elles ne contiennent ni BSP/triangles originaux ni média.
- Préserver `reference/doom1.wad` intégral et inchangé uniquement comme archive de recherche. Le build et les tests runtime doivent fonctionner sans `reference/`. Les anciens lecteurs et leurs tests sont des outils de référence, jamais des dépendances de `src/app.js`.
- `vendor/ferro/` contient des copies canoniques verrouillées. Ne pas les modifier localement. Toute évolution moteur doit passer par le dépôt M4D135/FERRO puis une mise à jour explicite du manifeste.
- Fidélité visuelle : inspecter les assets originaux de la référence et les captures du Doom PC avant de modifier les recettes. Conserver leurs silhouettes, dimensions, couleurs, motifs et caractéristiques reconnaissables. Les parties en volume absentes des vues originales sont des reconstructions explicites, sans prétendre à une identité pixel par pixel.
- Les règles de Doom et les générateurs du jeu appartiennent à ce projet. Cette évolution ne modifie pas les conventions des autres jeux.
- Ne pas modifier BITUME ou les autres dépôts pour ce projet.
- Construire avec `python3 tools/build.py` ; vérifier avec `node --test tests/*.test.mjs`.
- Vérifier visuellement le démarrage, le rendu, les déplacements, l’ouverture des portes et le HUD après un changement de rendu ou de commandes.
- Distinguer les tests exécutés, les vérifications visuelles, le commit GitHub et le déploiement.
- Travailler sur `main` et préserver les modifications concurrentes.
