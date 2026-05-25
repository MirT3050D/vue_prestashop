<script setup>
import { computed, ref } from 'vue';
import { resetTargets as productResetTargets } from '@/service/resetTargets';
import { resetDeclinaisonTargets } from '@/service/import';
import { runResetForTargets } from '@/service/resetService';

// ============================================================================
// INITIALISATION DES CIBLES (TABLES À RESET)
// ============================================================================
// Fusionne les cibles de suppression classiques (produits, catégories) et celles des déclinaisons
const allTargets = [...resetDeclinaisonTargets, ...productResetTargets];
const seenKeys = new Set();

// Filtre pour retirer les doublons (si une cible apparaît dans les deux tableaux)
const resetTargets = allTargets.filter(t => {
  if (seenKeys.has(t.key)) return false;
  seenKeys.add(t.key);
  return true;
});

// Récupère uniquement les clés des tables qui doivent être cochées par défaut
function getDefaultSelectedKeys() {
  const keys = [];
  for (const target of resetTargets) {
    if (target.defaultSelected) {
      keys.push(target.key);
    }
  }
  return keys;
}

// Convertit un tableau de clés ['products', 'categories'] en un tableau d'objets Target complets
function getSelectedTargetsFromKeys(keys) {
  const selected = [];
  for (const target of resetTargets) {
    if (keys.includes(target.key)) {
      selected.push(target);
    }
  }
  return selected;
}

// Crée une chaîne de caractères lisible (ex: "Produits, Catégories, Images") pour l'affichage
function getSelectedLabelFromTargets(targets) {
  const labels = [];
  for (const target of targets) {
    labels.push(target.label);
  }
  return labels.join(', ');
}

// ============================================================================
// ÉTAT RÉACTIF (VARIABLES)
// ============================================================================
const selectedTargetKeys = ref(getDefaultSelectedKeys()); // Les cases cochées
const confirmationText = ref(''); // Ce que l'utilisateur tape dans l'input de confirmation ("RESET")
const isRunning = ref(false);     // Verrou empêchant de cliquer 2 fois
const logs = ref([]);             // Tableau contenant l'historique des actions (Le journal)

// Computed properties pour mettre à jour l'interface automatiquement quand l'utilisateur coche/décoche
const selectedTargets = computed(() => getSelectedTargetsFromKeys(selectedTargetKeys.value));
const selectedLabel = computed(() => getSelectedLabelFromTargets(selectedTargets.value));

// Règle stricte: Pour avoir le droit de lancer le script, il faut :
// 1. Au moins 1 table sélectionnée.
// 2. Avoir tapé "RESET" (Peu importe les majuscules grâce à toUpperCase).
// 3. Ne pas être déjà en train de tourner.
const canRun = computed(() => {
  return selectedTargets.value.length > 0 && confirmationText.value.trim().toUpperCase() === 'RESET' && !isRunning.value;
});

// ============================================================================
// MÉTHODES
// ============================================================================
/**
 * Ajoute un message de Log dans le tableau.
 * Il est inséré au début (unshift) pour que les messages récents soient en haut.
 */
function addLog(level, message) {
  logs.value.unshift({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    level, // 'info', 'success', 'error'
    message
  });
}

/**
 * Méthode principale appelée lors du clic sur le bouton rouge.
 */
async function runReset() {
  if (!canRun.value) {
    return;
  }

  isRunning.value = true;
  logs.value = []; // Vide le journal précédent

  try {
    addLog('info', `Tables selectionnees: ${selectedLabel.value}.`);
    
    // Appel du service 'resetService' qui va faire le sale boulot via l'API
    // On lui passe 'addLog' en paramètre pour qu'il puisse écrire dans le journal lui-même
    await runResetForTargets(selectedTargets.value, addLog);
    
    addLog('success', 'Reset termine.');
  } finally {
    isRunning.value = false; // Quoi qu'il arrive (succès ou crash), on libère le bouton
  }
}

/**
 * Coche ou décoche toutes les cases d'un coup.
 */
function toggleAllTargets(event) {
  selectedTargetKeys.value = event.target.checked ? resetTargets.map((target) => target.key) : [];
}
</script>

<template>
  <div class="reset-page">
    
    <!-- 1. Bannière d'avertissement rouge/bleue (Hero) -->
    <section class="hero-card">
      <div>
        <p class="eyebrow">Reset PrestaShop</p>
        <h1>Reinitialiser les donnees via WebService API</h1>
        <p class="subtitle">
          Selectionne les tables a nettoyer, confirme l'action, puis lance la suppression entite par entite.
        </p>
      </div>
      <div class="warning-box">
        <strong>Action destructive</strong>
        <span>Aucun truncate n'est utilise. Le reset passe uniquement par les DELETE de l'API officielle.</span>
      </div>
    </section>

    <!-- 2. Grille principale divisée en deux (Liste à gauche, Bouton d'action à droite) -->
    <section class="content-grid">
      
      <!-- Colonne de Gauche : Liste des tables (Catégories, Produits, etc.) -->
      <div class="panel">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Tables a reinitialiser</p>
            <h2>Choix precis des entites</h2>
          </div>
          <!-- Option Tout cocher -->
          <label class="toggle-all">
            <input type="checkbox" :checked="selectedTargetKeys.length === resetTargets.length" @change="toggleAllTargets" />
            <span>Tout selectionner</span>
          </label>
        </div>

        <div class="target-list">
          <!-- Boucle générant chaque ligne avec une case à cocher (v-model="selectedTargetKeys") -->
          <label v-for="target in resetTargets" :key="target.key" class="target-item">
            <input v-model="selectedTargetKeys" type="checkbox" :value="target.key" />
            <div>
              <div class="target-title">
                <strong>{{ target.label }}</strong>
                <span>{{ target.endpoint }}</span>
              </div>
              <p>
                {{ target.defaultSelected ? 'Selectionnee par defaut.' : 'Optionnelle.' }}
                <!-- Affiche si certains IDs vitaux sont protégés contre la suppression (Ex: Catégorie Racine) -->
                <span v-if="target.skipIds.length"> IDs exclus: {{ target.skipIds.join(', ') }}.</span>
              </p>
            </div>
          </label>
        </div>
      </div>

      <!-- Colonne de Droite : Validation et Lancement (Sticky, reste figée au scroll) -->
      <div class="panel sticky">
        <p class="panel-kicker">Controle</p>
        <h2>Validation avant execution</h2>

        <!-- Sécurité : L'utilisateur doit taper 'RESET' manuellement -->
        <label class="field">
          <span>Retape RESET pour confirmer</span>
          <input v-model="confirmationText" type="text" placeholder="RESET" />
        </label>

        <!-- Résumé chiffré -->
        <div class="summary">
          <div>
            <span>Tables retenues</span>
            <strong>{{ selectedTargets.length }}</strong>
          </div>
          <div>
            <span>Etat</span>
            <strong>{{ isRunning ? 'En cours' : 'Pret' }}</strong>
          </div>
        </div>

        <!-- LE Bouton rouge de la mort -->
        <button class="run-button" type="button" :disabled="!canRun" @click="runReset">
          {{ isRunning ? 'Reset en cours...' : 'Lancer le reset' }}
        </button>

        <p class="helper-text">
          Tables selectionnees : {{ selectedLabel || 'aucune' }}
        </p>
      </div>
    </section>

    <!-- 3. Zone du bas : Le terminal / journal d'activité en temps réel -->
    <section class="panel log-panel">
      <p class="panel-kicker">Journal</p>
      <h2>Resultats du reset</h2>

      <div v-if="!logs.length" class="empty-state">
        Aucun evenement pour le moment.
      </div>

      <ul v-else class="log-list">
        <!-- Chaque ligne prend une couleur selon son level (info = gris, success = vert, error = rouge) -->
        <li v-for="entry in logs" :key="entry.id" :class="`log-${entry.level}`">
          {{ entry.message }}
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
/* Design général typique d'une interface d'administration système */
.reset-page {
  display: grid;
  gap: 24px;
}

.hero-card,
.panel {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.08);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  padding: 28px;
  background: linear-gradient(135deg, #0f172a, #1d4ed8 72%, #38bdf8);
  color: #eff6ff;
}

/* Surtitre */
.eyebrow,
.panel-kicker {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 0.72rem;
  font-weight: 700;
}

.hero-card h1,
.panel h2 {
  margin: 0;
  line-height: 1.1;
}

.subtitle {
  max-width: 720px;
  margin: 14px 0 0;
  color: rgba(239, 246, 255, 0.88);
}

.warning-box {
  max-width: 300px;
  align-self: center;
  padding: 16px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.14);
  border: 1px solid rgba(255, 255, 255, 0.16);
  display: grid;
  gap: 8px;
}

.content-grid {
  display: grid;
  /* 1.6 fraction pour la liste, 0.9 pour le panneau de contrôle */
  grid-template-columns: minmax(0, 1.6fr) minmax(320px, 0.9fr);
  gap: 24px;
  align-items: start; /* Empêche le panneau de droite de s'étirer en hauteur */
}

.panel {
  padding: 24px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: center;
  margin-bottom: 18px;
}

.toggle-all {
  display: inline-flex;
  gap: 10px;
  align-items: center;
  color: #0f172a;
  font-weight: 600;
}

.target-list {
  display: grid;
  gap: 12px;
}

.target-item {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 14px;
  padding: 16px;
  border-radius: 18px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  cursor: pointer;
}

.target-item input {
  margin-top: 5px;
}

.target-title {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: baseline;
}

.target-title span {
  color: #64748b;
  font-size: 0.9rem;
}

.target-item p,
.helper-text {
  margin: 8px 0 0;
  color: #475569;
}

/* Le bloc de droite reste visible même si on scrolle loin dans la liste */
.sticky {
  position: sticky;
  top: 24px;
}

.field {
  display: grid;
  gap: 10px;
  margin: 20px 0;
}

.field span {
  font-weight: 600;
  color: #0f172a;
}

.field input {
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  padding: 12px 14px;
  font-size: 1rem;
}

.summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary div {
  padding: 14px;
  border-radius: 16px;
  background: #eff6ff;
  display: grid;
  gap: 6px;
}

.summary span {
  color: #475569;
  font-size: 0.9rem;
}

.summary strong {
  color: #0f172a;
  font-size: 1.2rem;
}

.run-button {
  width: 100%;
  border: none;
  border-radius: 16px;
  padding: 14px 16px;
  background: linear-gradient(135deg, #dc2626, #ef4444); /* Rouge Danger */
  color: white;
  font-weight: 700;
  cursor: pointer;
  transition: transform 160ms ease, opacity 160ms ease;
}

.run-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.run-button:not(:disabled):hover {
  transform: translateY(-1px);
}

.empty-state {
  padding: 18px;
  border-radius: 16px;
  background: #f8fafc;
  color: #64748b;
}

.log-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 10px;
}

.log-list li {
  padding: 12px 14px;
  border-radius: 14px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

/* Couleurs des messages du journal */
.log-info {
  color: #0f172a;
}

.log-success {
  color: #166534;
  background: #f0fdf4;
  border-color: #bbf7d0;
}

.log-error {
  color: #b91c1c;
  background: #fef2f2;
  border-color: #fecaca;
}

/* Sur tablette, on empile les colonnes et on enlève l'effet sticky */
@media (max-width: 960px) {
  .hero-card,
  .content-grid {
    grid-template-columns: 1fr;
    display: grid;
  }

  .sticky {
    position: static;
  }
}
</style>
