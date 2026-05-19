# Vue Back-office : Interface d'Importation (`ImportView.vue`)

Cette vue fournit une interface simple pour téléverser et exécuter l'importation de fichiers CSV (Produits, Variations, Commandes) et de fichiers ZIP (Images).

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Saisie Unitaire & Drag and Drop** :
    *   Permet de sélectionner un fichier local pour chaque flux séparément.
2.  **Analyse PapaParse** :
    *   Lit et convertit les fichiers CSV textuels en tableaux d'objets JSON exploitables par les scripts de service d'importation.
3.  **Bouton d'Import Global Séquentiel** :
    *   Lors du clic sur "Lancer l'import", la vue orchestre les imports les uns après les autres pour respecter l'intégrité de la base de données :
        1.  **Produits** : Création du catalogue parent.
        2.  **Déclinaisons** : Association des variantes et mise à jour initiale des stocks.
        3.  **Commandes** : Réplication de l'historique des ventes.
        4.  **Images** : Téléversement du ZIP d'images produits.
4.  **Console de Logging temps réel** :
    *   Affiche en couleur (Bleu: Info, Vert: Succès, Rouge: Erreur) les événements générés par les modules d'importation.

---

## 🛠️ Extraits de Code Clés

Voici l'orchestrateur d'importation séquentiel écrit dans `src/view/backoffice/ImportView.vue` :

```javascript
const startAllImports = async () => {
  isImportingAll.value = true;
  logs.value = [];

  try {
    // 1. Étape Produits
    if (fileProduct.value) {
      addLog('info', 'Lecture CSV Produits...');
      const data = await parseCsvFile(fileProduct.value);
      addLog('success', `${data.length} lignes trouvées. Importation en cours...`);
      await processProductImport(data, addLog);
    }

    // 2. Étape Déclinaisons
    if (fileVariant.value) {
      addLog('info', 'Lecture CSV Variations...');
      const data = await parseCsvFile(fileVariant.value);
      addLog('success', `${data.length} lignes trouvées. Importation en cours...`);
      await processVariantImport(data, addLog);
    }

    // 3. Étape Commandes
    if (fileOrder.value) {
      addLog('info', 'Lecture CSV Commandes...');
      const data = await parseCsvFile(fileOrder.value);
      addLog('success', `${data.length} lignes trouvées. Importation en cours...`);
      await processOrderImport(data, addLog);
    }

    // 4. Étape Images
    if (fileImage.value) {
      addLog('info', 'Import Images (zip) — début...');
      await processImageImport(fileImage.value, addLog);
    }

    addLog('success', 'Import global terminé.');
  } catch (e) {
    addLog('error', `Erreur lors de l'import global : ${e.message}`);
  } finally {
    isImportingAll.value = false;
  }
};
```
