# Archive de recherche

Ce dossier conserve la référence utilisée pour relever le plan d’E1M1 et
comparer les anciennes lectures binaires. Il est exclu de la distribution du
jeu. Les modules de `src/` construisent la carte, les images et les sons par
code ; ils n’importent aucun fichier de cette archive.

- `doom1.wad` : référence shareware 1.9 intégrale et inchangée.
- `wad-provenance.json` : provenance et empreintes de cette référence.
- `wad.js` : ancien lecteur du format, réservé aux comparaisons.
- `audio.js` : ancien décodeur/séquenceur des ressources sonores de référence.
- `../tests/reference/` : tests historiques de ces lecteurs, séparés des tests
  du runtime procédural.

Les tests du jeu se lancent avec `node --test tests/*.test.mjs`. Pour vérifier
séparément cette archive :

```sh
node --test tests/reference/*.test.mjs
```

Le relevé des paramètres géométriques est reproductible avec
`node tools/export-e1m1-plan.mjs`. Cet outil exporte seulement les murs,
secteurs, mécanismes et placements ; il ne transfère ni médias ni BSP dans le
plan. La construction normale du jeu ne l’appelle pas.

Si la référence de recherche manque, `python3 tools/fetch-shareware.py` peut la
récupérer ici. Son SHA256 attendu est
`1d7d43be501e67d927e415e0b8f3e29c3bf33075e859721816f652a526cac771`.
