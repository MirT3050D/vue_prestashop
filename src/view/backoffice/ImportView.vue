<template>
  <div class="import-page">
    <h1>Import de Données via CSV</h1>
    <p>Sélectionnez un fichier CSV pour importer des données dans PrestaShop.</p>

    <!-- Grille affichant les 4 types de fichiers que l'on peut importer -->
    <div class="import-grid">
      
      <!-- Card 1: Import de Produits -->
      <div class="upload-card">
        <h2>1. Import de Produits</h2>
        <p>Format: reference, nom, prix_ttc, Taxe, categorie</p>
        <div class="upload-section">
          <!-- onFileChange permet de stocker le fichier sélectionné dans la bonne variable métier -->
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'product')" :disabled="isImportingAll"
            class="file-input" />
        </div>
      </div>

      <!-- Card 2: Import de Variations (Déclinaisons) -->
      <div class="upload-card">
        <h2>2. Import de Variations</h2>
        <!-- ex: karazany = type, couleur... -->
        <p>Format: reference, specificité, karazany, stock_initial, prix_vente_ttc, Taxe</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'variant')" :disabled="isImportingAll"
            class="file-input" />
        </div>
      </div>

      <!-- Card 3: Import de Commandes -->
      <div class="upload-card">
        <h2>3. Import de Commandes</h2>
        <p>Format: customer_email, customer_firstname, customer_lastname, product_reference, product_quantity,
          order_date</p>
        <div class="upload-section">
          <input type="file" accept=".csv" @change="(e) => onFileChange(e, 'order')" :disabled="isImportingAll"
            class="file-input" />
        </div>
      </div>

      <!-- Card 4: Import d'Images (Fichier ZIP) -->
      <div class="upload-card">
        <h2>4. Import d'Images</h2>
        <p>Ne pas importer les image</p>

        <!-- Option spéciale pour squeezer (ignorer) l'import d'images car c'est souvent très long -->
        <input type="checkbox" v-model="checkbox">
        {{ checkbox }}
        <p>Format: .zip contenant les images (ex: REF123.jpg, REF123_1.png)</p>
        <div class="upload-section">
          <input type="file" accept=".zip" @change="(e) => onFileChange(e, 'image')" :disabled="isImportingAll"
            class="file-input" />
        </div>
      </div>
    </div>

    <!-- Bouton maître pour tout lancer -->
    <div class="controls" style="margin-top:20px;">
      <button class="action-btn" @click="startAllImports" :disabled="isImportingAll">
        {{ isImportingAll ? 'Import global en cours...' : 'Lancer l\'import (produit → déclinaison → commande → image)'
        }}
      </button>
    </div>

    <!-- Le terminal / Journal d'activité -->
    <div v-if="logs.length" class="logs-section">
      <h3>Journal de l'import :</h3>
      <ul>
        <li v-for="(log, index) in logs" :key="index" :class="log.type">
          {{ log.message }}
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
/**
 * @file ImportView.vue
 * @description Interface d'importation de données de masse (Produits, Variations, Commandes, Images) via CSV et ZIP.
 * Il est impératif de respecter l'ordre séquentiel d'import (Produits -> Variations -> Commandes -> Images)
 * pour ne pas briser l'intégrité référentielle de PrestaShop. Utilise PapaParse pour lire les CSV.
 */
import { ref, vModelCheckbox } from 'vue';
// Librairie PapaParse : Le couteau suisse pour lire du CSV en javascript !
import Papa from 'papaparse';
import { processProductImport, processVariantImport, processOrderImport } from '@/service/import';
import { processImageImport } from '@/service/imageImport';

// ============================================================================
// VARIABLES RÉACTIVES
// ============================================================================
const checkbox = ref(false); // Ignorer les images (Logique inversée dans le code)
const fileProduct = ref(null); // Fichier sélectionné pour les produits
const fileVariant = ref(null); // Fichier sélectionné pour les déclinaisons
const fileOrder = ref(null);   // Fichier sélectionné pour les commandes
const fileImage = ref(null);   // Fichier sélectionné pour les images
const isImportingAll = ref(false); // Sécurité anti double-clic
const logs = ref([]); // Le journal de bord

// ============================================================================
// MÉTHODES
// ============================================================================
/**
 * Pousse une ligne de log dans le terminal virtuel.
 * @param {string} type - 'info', 'success', 'error'
 * @param {string} message - Le texte à afficher
 */
const addLog = (type, message) => {
  logs.value.push({ type, message });
};

/**
 * Fonction appelée chaque fois que l'utilisateur clique sur "Parcourir" et sélectionne un fichier.
 */
const onFileChange = (event, type) => {
  if (type === 'product') {
    fileProduct.value = event.target.files[0];
  } else if (type === 'variant') {
    fileVariant.value = event.target.files[0];
  } else if (type === 'order') {
    fileOrder.value = event.target.files[0];
  } else if (type === 'image') {
    fileImage.value = event.target.files[0];
  }
};

/**
 * Transforme le fichier CSV brut du disque dur en un Tableau JavaScript JSON compréhensible.
 */
function parseCsvFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true, // Utilise la première ligne du CSV comme nom des colonnes
      skipEmptyLines: true, // Ignore les lignes vides à la fin du fichier
      complete: (results) => resolve(results.data),
      error: (err) => reject(err)
    });
  });
}

/**
 * Chef d'orchestre global. Exécute les imports SÉQUENTIELLEMENT (Produits -> Déclinaisons -> Commandes -> Images).
 * L'ordre est CRITIQUE. On ne peut pas importer une commande si le produit n'existe pas encore !
 */
const startAllImports = async () => {
  isImportingAll.value = true;
  logs.value = []; // Vide le terminal

  try {
    // ÉTAPE 1 : PRODUITS
    if (fileProduct.value) {
      addLog('info', 'Lecture CSV Produits...');
      const data = await parseCsvFile(fileProduct.value);
      addLog('success', `${data.length} lignes trouvées dans le CSV Produits. Début de l'import.`);
      await processProductImport(data, addLog); // Laisse le service d'import faire le sale boulot
    } else {
      addLog('info', 'Pas de fichier Produits fourni — ignoré.');
    }

    // ÉTAPE 2 : DÉCLINAISONS
    if (fileVariant.value) {
      addLog('info', 'Lecture CSV Variations...');
      const data = await parseCsvFile(fileVariant.value);
      addLog('success', `${data.length} lignes trouvées dans le CSV Variations. Début de l'import.`);
      await processVariantImport(data, addLog);
    } else {
      addLog('info', 'Pas de fichier Variations fourni — ignoré.');
    }

    // ÉTAPE 3 : COMMANDES
    if (fileOrder.value) {
      addLog('info', 'Lecture CSV Commandes...');
      const data = await parseCsvFile(fileOrder.value);
      addLog('success', `${data.length} lignes trouvées dans le CSV Commandes. Début de l'import.`);
      await processOrderImport(data, addLog);
    } else {
      addLog('info', 'Pas de fichier Commandes fourni — ignoré.');
    }

    // ÉTAPE 4 : IMAGES (Si la case n'est pas cochée)
    if (checkbox.value == false) {
      if (fileImage.value) {
        addLog('info', 'Import Images (zip) — début...');
        await processImageImport(fileImage.value, addLog); // Le service Image gère le dézippage lui-même
      } else {
        addLog('info', 'Pas de fichier Images fourni — ignoré.');
      }
    }
    else {
      addLog('info', 'image non importé');
    }
    
    addLog('success', 'Import global terminé.');
  } catch (e) {
    // Interception des erreurs fatales
    addLog('error', `Erreur lors de l'import global : ${e.message}`);
  } finally {
    isImportingAll.value = false; // Déverrouillage final
  }
};
</script>

<style scoped>
/* Conteneur principal limité en largeur pour rester beau sur grand écran */
.import-page {
  max-width: 1000px;
  margin: 0 auto;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  padding: 20px;
}

/* Grille 2 colonnes (Desktop) */
.import-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 30px;
}

/* Grille 1 colonne (Mobile) */
@media (max-width: 768px) {
  .import-grid {
    grid-template-columns: 1fr;
  }
}

/* Style des cartes blanches */
.upload-card {
  background: white;
  padding: 24px;
  border-radius: 12px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  border: 1px solid #e2e8f0;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.upload-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 15px rgba(0, 0, 0, 0.08);
}

.upload-card h2 {
  font-size: 1.25rem;
  color: #1e293b;
  margin-top: 0;
  margin-bottom: 8px;
}

.upload-card p {
  font-size: 0.85rem;
  color: #64748b;
  margin-bottom: 20px;
  flex-grow: 1; /* Pousse l'input vers le bas */
}

.upload-section {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.file-input {
  width: 100%;
  font-size: 0.9rem;
}

/* Le bouton principal dégradé */
.action-btn {
  padding: 12px 20px;
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: white;
  font-weight: bold;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
}

.action-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.action-btn:disabled {
  background: #cbd5e1;
  color: #64748b;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

/* Style Terminal / Journal */
.logs-section {
  margin-top: 40px;
  background-color: #1e293b;
  color: #cbd5e1;
  padding: 24px;
  border-radius: 12px;
  max-height: 400px;
  overflow-y: auto; /* Scroll interne */
  font-family: monospace; /* Police code source */
}

.logs-section h3 {
  margin-top: 0;
  color: white;
  margin-bottom: 15px;
}

.logs-section ul {
  list-style: none;
  padding: 0;
  margin: 0;
}

/* Lignes de logs */
.logs-section li {
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  font-size: 0.9rem;
  white-space: pre-wrap;
  word-break: break-word;
}

/* Couleurs spécifiques selon le type d'événement */
.info {
  color: #60a5fa;
  border-left: 3px solid #60a5fa;
}

.success {
  color: #4ade80;
  border-left: 3px solid #4ade80;
}

.error {
  color: #f87171;
  font-weight: bold;
  background-color: rgba(248, 113, 113, 0.1);
  border-left: 3px solid #f87171;
}
</style>
