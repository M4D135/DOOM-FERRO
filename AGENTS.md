# DOOM-FERRO

- Objectif : E1M1 de Doom shareware 1.9 jouable dans FERRO, avec les données originales.
- Préserver `assets/doom1.wad` intégral et inchangé, SHA256 vérifié dans `tools/build.py`.
- `vendor/ferro/` contient des copies canoniques verrouillées. Ne pas les modifier localement. Toute évolution moteur doit passer par le dépôt M4D135/FERRO puis une mise à jour explicite du manifeste.
- L’import WAD, les textures importées et les règles de Doom sont propres à ce jeu. La demande de l’utilisateur autorise ces ressources ici, sans changer les règles des autres jeux.
- Ne pas modifier BITUME ou les autres dépôts pour ce projet.
- Construire avec `python3 tools/build.py` ; vérifier avec `node --test tests/*.test.mjs`.
- Vérifier visuellement le démarrage, le rendu, les déplacements, l’ouverture des portes et le HUD après un changement de rendu ou de commandes.
- Distinguer les tests exécutés, les vérifications visuelles, le commit GitHub et le déploiement.
- Travailler sur `main` et préserver les modifications concurrentes.
