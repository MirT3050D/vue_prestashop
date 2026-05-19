# Composants du Back-office (`vue/src/components/backoffice/`)

Ces widgets spécialisés fournissent des graphiques de ventes et des classements de produits affichés au sein du tableau de bord d'administration (`DashboardView.vue`).

---

## 📊 Liste des Widgets d'Administration

### 1. Classement des Ventes (`MeilleurProduit.vue`)
Ce composant affiche le classement Top 5 des produits les plus vendus de la boutique.
*   **Fonctionnement interne** :
    *   Reçoit la liste des produits via la prop `produits`.
    *   Trie les produits par volume de vente décroissant (`b.ventes - a.ventes`) à l'aide d'une propriété calculée (`computed`) et conserve uniquement les 5 premiers éléments (`slice(0, 5)`).
*   **Règles de Design** :
    *   Attribue des classes de couleurs spécifiques de podium pour les trois premières places (Or pour le 1er, Argent pour le 2ème, Bronze pour le 3ème).

---

### 2. Résumé des Ventes (`StatistiqueVente.vue`)
Ce widget propose un tableau chronologique des ventes journalières doublé d'un encart de synthèse.
*   **Fonctionnement interne** :
    *   Prend en entrée la prop `stats` (un tableau d'objets `{ date, nb_commande, CA }`).
    *   Calcule les sommes globales (Chiffre d'Affaires total cumulé et volume de commandes passées) en utilisant la méthode JavaScript `reduce`.
*   **Affichage** :
    *   Formate les montants financiers en euros en utilisant l'utilitaire natif `Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' })`.
