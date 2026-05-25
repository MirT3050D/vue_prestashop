<template>
    <!-- Conteneur principal de la carte de statistiques -->
    <div class="stat-card">
        <div class="stat-header">
            <h3>Résumé des Ventes</h3>
        </div>

        <!-- Section Résumé (Affichage des Totaux globaux) -->
        <div class="stat-summary">
            <!-- Bloc Chiffre d'Affaires -->
            <div class="summary-item">
                <span class="label">Chiffre d'Affaires Total</span>
                <span class="value ca">{{ formatCurrency(totalCA) }}</span>
            </div>
            <!-- Bloc Nombre de commandes -->
            <div class="summary-item">
                <span class="label">Commandes Totales</span>
                <span class="value commandes">{{ totalCommandes }}</span>
            </div>
        </div>

        <!-- Section Détails (Tableau listant les ventes jour par jour) -->
        <div class="stat-details">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Commandes</th>
                        <th>C.A.</th>
                    </tr>
                </thead>
                <tbody>
                    <!-- Boucle sur l'historique des statistiques fourni par l'API -->
                    <tr v-for="(item, index) in stats" :key="index">
                        <td>{{ formatDate(item.date) }}</td>
                        <td>{{ item.nb_commande }}</td>
                        <td class="font-semibold">{{ formatCurrency(item.CA) }}</td>
                    </tr>
                    <!-- État vide : S'il n'y a eu aucune vente sur la période -->
                    <tr v-if="stats.length === 0">
                        <td colspan="3" class="empty-state">Aucune donnée disponible</td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

// ============================================================================
// DÉFINITION DES PROPRIÉTÉS (PROPS)
// ============================================================================
const props = defineProps({
    // Tableau contenant l'historique des ventes (ex: groupé par jour ou mois)
    stats: {
        type: Array,
        required: true,
        default: () => []
    }
});

// ============================================================================
// CALCULS RÉACTIFS (COMPUTED)
// ============================================================================
/**
 * Calcule le Chiffre d'Affaires Total en additionnant la colonne 'CA' de chaque ligne de 'stats'.
 * La méthode .reduce() parcourt le tableau et accumule le total.
 */
const totalCA = computed(() => {
    return props.stats.reduce((sum, item) => sum + Number(item.CA || 0), 0);
});

/**
 * Calcule le Nombre de Commandes Total de la même manière.
 */
const totalCommandes = computed(() => {
    return props.stats.reduce((sum, item) => sum + Number(item.nb_commande || 0), 0);
});

// ============================================================================
// FONCTIONS DE FORMATAGE
// ============================================================================
/**
 * Formate un montant en Euros (€) avec les séparateurs de milliers.
 */
const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR' // À adapter selon ta devise (ex: 'MGA' pour Ariary)
    }).format(value);
};

/**
 * Formate une date brute (ex: "2023-10-15") en un format lisible (ex: "15 oct. 2023").
 */
const formatDate = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric'
    }).format(date);
};
</script>

<style scoped>
/* Design global de la carte (Ombres douces, coins arrondis) */
.stat-card {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    padding: 1.5rem;
    max-width: 600px;
    font-family: system-ui, -apple-system, sans-serif;
}

.stat-header h3 {
    margin: 0 0 1.5rem 0;
    color: #111827;
    font-size: 1.25rem;
    font-weight: 600;
}

/* Flexbox pour aligner horizontalement les compteurs Totaux */
.stat-summary {
    display: flex;
    gap: 1.5rem;
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
}

.summary-item {
    display: flex;
    flex-direction: column;
}

.summary-item .label {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.25rem;
}

.summary-item .value {
    font-size: 1.5rem;
    font-weight: 700;
}

/* Codes couleurs sémantiques pour les totaux */
.summary-item .ca {
    color: #059669;
    /* Vert pour le CA (Argent) */
}

.summary-item .commandes {
    color: #2563eb;
    /* Bleu pour les commandes (Action) */
}

/* Style du tableau détaillé */
table {
    width: 100%;
    border-collapse: collapse;
    text-align: left;
}

th {
    padding: 0.75rem 0.5rem;
    color: #6b7280;
    font-size: 0.875rem;
    font-weight: 500;
    border-bottom: 2px solid #e5e7eb;
}

td {
    padding: 0.875rem 0.5rem;
    color: #374151;
    font-size: 0.95rem;
    border-bottom: 1px solid #f3f4f6;
}

.font-semibold {
    font-weight: 600;
}

/* Style du message "Aucune donnée" */
.empty-state {
    text-align: center;
    color: #9ca3af;
    font-style: italic;
    padding: 2rem 0;
}
</style>