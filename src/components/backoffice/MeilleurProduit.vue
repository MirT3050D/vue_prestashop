<template>
    <!-- Carte d'affichage des statistiques -->
    <div class="top-products-card">
        <!-- En-tête -->
        <div class="header">
            <h3>Top 5 des Produits</h3>
            <span class="subtitle">Les plus vendus</span>
        </div>

        <!-- Liste des produits -->
        <div class="products-list">
            <!-- Boucle sur les 5 meilleurs produits -->
            <div v-for="(produit, index) in top5Produits" :key="produit.id" class="product-item">
                <!-- Badge de position (1, 2, 3...) : Le style s'adapte dynamiquement avec la classe rank-1, rank-2, etc. -->
                <div class="rank" :class="'rank-' + (index + 1)">
                    {{ index + 1 }}
                </div>

                <!-- Informations textuelles (Nom et Référence) -->
                <div class="product-info">
                    <span class="product-name">{{ produit.nom }}</span>
                    <span class="product-ref">Réf: {{ produit.reference }}</span>
                </div>

                <!-- Métriques (Nombre de ventes et Chiffre d'Affaires généré) -->
                <div class="product-stats">
                    <span class="sales-count">{{ produit.ventes }} vendus</span>
                    <span class="revenue">{{ formatCurrency(produit.ca) }}</span>
                </div>
            </div>

            <!-- État vide : Message affiché si le tableau est vide (ex: Nouvelle boutique) -->
            <div v-if="top5Produits.length === 0" class="empty-state">
                Aucun produit à afficher
            </div>
        </div>
    </div>
</template>

<script setup>
import { computed } from 'vue';

// ============================================================================
// DÉFINITION DES PROPRIÉTÉS (PROPS)
// ============================================================================
const props = defineProps({
    // Tableau des statistiques brutes (Contient tous les produits vendus)
    produits: {
        type: Array,
        required: true,
        default: () => []
    }
});

// ============================================================================
// CALCULS RÉACTIFS (COMPUTED)
// ============================================================================
/**
 * Trie le tableau entier des produits par ordre décroissant de ventes,
 * et ne conserve que les 5 premiers éléments.
 * Se met à jour automatiquement si la prop `produits` change.
 */
const top5Produits = computed(() => {
    return [...props.produits]
        .sort((a, b) => b.ventes - a.ventes) // Trie par ordre décroissant des ventes
        .slice(0, 5); // Garde uniquement les 5 premiers
});

// ============================================================================
// FONCTIONS UTILITAIRES
// ============================================================================
/**
 * Formate un nombre brut en devise (ex: 1250.5 -> "1 250,50 €")
 * Utilise l'API native Intl du navigateur pour une localisation parfaite.
 */
const formatCurrency = (value) => {
    return new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR'
    }).format(value || 0);
};
</script>

<style scoped>
/* Style de la carte principale */
.top-products-card {
    background: #ffffff;
    border-radius: 12px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    padding: 1.5rem;
    max-width: 400px;
    font-family: system-ui, -apple-system, sans-serif;
}

.header {
    margin-bottom: 1.5rem;
}

.header h3 {
    margin: 0;
    color: #111827;
    font-size: 1.25rem;
    font-weight: 600;
}

.subtitle {
    font-size: 0.875rem;
    color: #6b7280;
}

.products-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
}

/* Style de chaque ligne de produit */
.product-item {
    display: flex;
    align-items: center;
    padding: 0.75rem;
    background: #f9fafb;
    border-radius: 8px;
    transition: transform 0.2s ease;
}

/* Effet de glissement au survol de la ligne */
.product-item:hover {
    transform: translateX(4px);
    background: #f3f4f6;
}

/* Style de base du rond de classement (Rank) */
.rank {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: #e5e7eb;
    color: #4b5563;
    font-weight: 700;
    font-size: 0.875rem;
    margin-right: 1rem;
    flex-shrink: 0;
}

/* Couleurs spéciales pour le podium */
/* Or */
.rank-1 {
    background: #fef08a;
    color: #854d0e;
}

/* Argent */
.rank-2 {
    background: #e5e7eb;
    color: #374151;
}

/* Bronze */
.rank-3 {
    background: #fed7aa;
    color: #9a3412;
}

/* Section d'information au centre */
.product-info {
    display: flex;
    flex-direction: column;
    flex-grow: 1;
    min-width: 0;
    /* Permet la troncature du texte si trop long (avec les points de suspension) */
    margin-right: 1rem;
}

.product-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 0.95rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis; /* Ajoute "..." si le nom dépasse */
}

.product-ref {
    font-size: 0.75rem;
    color: #6b7280;
}

/* Section des compteurs (Droite) */
.product-stats {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
}

.sales-count {
    font-size: 0.875rem;
    font-weight: 600;
    color: #2563eb;
}

.revenue {
    font-size: 0.75rem;
    color: #6b7280;
}

/* Style du message "Aucun produit" */
.empty-state {
    text-align: center;
    color: #9ca3af;
    font-style: italic;
    padding: 2rem 0;
}
</style>