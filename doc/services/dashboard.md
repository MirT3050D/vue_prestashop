# Service : Tableau de bord et Statistiques (`dashboardService.js`)

Ce service, principalement utilisé dans le back-office (`DashboardView.vue`), est conçu pour analyser en temps réel les données de la boutique et fournir des KPI (indicateurs clés de performance) aux administrateurs.

---

## ⚙️ Rôle et Fonctionnement

*   **Extraction de données massives** : Interroge l'API pour récupérer toutes les commandes, clients, et mouvements de stock sur une période donnée.
*   **Agrégation des métriques** : Calcule le chiffre d'affaires, le panier moyen, et le nombre de nouveaux clients.
*   **Historique de performance** : Crée des séries temporelles (ex: CA par jour) formatées pour être affichées directement dans des graphiques de statistiques (par exemple via Chart.js ou ApexCharts).

---

## 📘 Guide d'utilisation des fonctions

### `getDashboardStats(dateFrom, dateTo)`
C'est la fonction maîtresse du service. Elle accepte une date de début et une date de fin, puis retourne un objet structuré contenant toutes les statistiques vitales de la période.

**Exemple d'utilisation :**
```javascript
import { getDashboardStats } from '@/service/dashboardService';

const stats = await getDashboardStats('2023-01-01', '2023-12-31');

console.log("Chiffre d'affaires total :", stats.totalRevenue);
console.log("Nombre de commandes :", stats.ordersCount);
console.log("Nouveaux clients :", stats.newCustomersCount);
console.log("Série temporelle des ventes :", stats.revenueChartData);
```

### Autres Helpers (souvent internes)
Le fichier contient également d'autres sous-fonctions dédiées au calcul de la croissance (pourcentage d'augmentation par rapport au mois dernier, par exemple) ou au filtrage des commandes valides.
