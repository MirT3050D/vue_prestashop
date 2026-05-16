<script setup>
import { computed, onMounted, ref } from 'vue';
import { getOrders } from '@/service/orderService';
import StatistiqueVente from '@/components/backoffice/StatistiqueVente.vue';
import MeilleurProduit from '@/components/backoffice/MeilleurProduit.vue';

const rawOrders = ref([]);
const startDate = ref('');
const endDate = ref('');
const aggregationInterval = ref('daily');

// Remplacement de la fonction fléchée et du ternaire (? :) par des if/else
function extractText(v) {
  if (v && typeof v === 'object') {
    if (v['#text']) {
      return String(v['#text']);
    } else {
      return '';
    }
  } else {
    if (v) {
      return String(v);
    } else {
      return '';
    }
  }
}

// Remplacement du ternaire et de l'opérateur logique court (||)
function toNumber(v) {
  if (v) {
    const valueAsString = String(v).replace(',', '.');
    const parsedNumber = parseFloat(valueAsString);
    if (parsedNumber) {
      return parsedNumber;
    } else {
      return 0;
    }
  } else {
    return 0;
  }
}

// Fonction classique
function getIntervalKey(dateString) {
  const d = new Date(dateString.replace(' ', 'T'));

  if (isNaN(d.getTime())) {
    return null;
  }

  const y = d.getFullYear();
  let m = String(d.getMonth() + 1);

  // Ajouter un 0 au début si le mois est un seul chiffre (ex: "5" devient "05")
  if (m.length === 1) {
    m = '0' + m;
  }

  if (aggregationInterval.value === 'yearly') {
    return y + '-01-01';
  }

  if (aggregationInterval.value === 'monthly') {
    return y + '-' + m + '-01';
  }

  if (aggregationInterval.value === 'weekly') {
    let day = d.getDay();
    if (day === 0) {
      day = 7; // Le dimanche (0) devient 7
    }
    d.setHours(-24 * (day - 1)); // Reculer les jours jusqu'au lundi
    return d.toISOString().slice(0, 10);
  }

  return d.toISOString().slice(0, 10);
}

// Utilisation de function() au lieu de () => dans le computed
const filteredOrders = computed(function () {
  return rawOrders.value.filter(function (o) {
    const d = extractText(o.date_add).slice(0, 10);

    let isAfterStart = true;
    if (startDate.value) {
      if (d < startDate.value) {
        isAfterStart = false;
      }
    }

    let isBeforeEnd = true;
    if (endDate.value) {
      if (d > endDate.value) {
        isBeforeEnd = false;
      }
    }

    return isAfterStart && isBeforeEnd;
  });
});

const salesStats = computed(function () {
  const stats = {};

  // Remplacement de "for...of" par une boucle for classique
  for (let i = 0; i < filteredOrders.value.length; i++) {
    const o = filteredOrders.value[i];
    const key = getIntervalKey(extractText(o.date_add));

    if (!key) {
      continue; // Passe directement à la prochaine commande
    }

    if (!stats[key]) {
      stats[key] = { date: key, nb_commande: 0, CA: 0 };
    }

    stats[key].nb_commande += 1;
    stats[key].CA += toNumber(o.total_paid_tax_incl);
  }

  const statsArray = Object.values(stats);

  // Remplacement de la fonction fléchée dans le sort()
  return statsArray.sort(function (a, b) {
    return b.date.localeCompare(a.date);
  });
});

const topProducts = computed(function () {
  const stats = {};

  for (let i = 0; i < filteredOrders.value.length; i++) {
    const o = filteredOrders.value[i];

    // Remplacement du "?." (optional chaining) par des vérifications "if"
    let rows = null;
    if (o.associations && o.associations.order_rows) {
      rows = o.associations.order_rows.order_row;
    }

    // Remplacement du ternaire pour s'assurer qu'on a bien un tableau
    let items = [];
    if (Array.isArray(rows)) {
      items = rows;
    } else if (rows) {
      items = [rows]; // S'il n'y a qu'un seul objet, on le met dans un tableau
    }

    for (let j = 0; j < items.length; j++) {
      const item = items[j];
      const id = extractText(item.product_id);

      if (!id) {
        continue;
      }

      if (!stats[id]) {
        stats[id] = {
          id: id,
          nom: extractText(item.product_name),
          reference: extractText(item.product_reference),
          ventes: 0,
          ca: 0
        };
      }

      const qty = toNumber(item.product_quantity);
      stats[id].ventes += qty;
      stats[id].ca += toNumber(item.unit_price_tax_incl) * qty;
    }
  }

  const statsArray = Object.values(stats);

  const sortedArray = statsArray.sort(function (a, b) {
    return b.ventes - a.ventes;
  });

  return sortedArray.slice(0, 5); // Garde seulement les 5 premiers
});

// Déclaration de fonction asynchrone classique
async function fetchData() {
  rawOrders.value = await getOrders({ display: 'full' });

  if (rawOrders.value.length > 0 && !startDate.value) {

    // Remplacement de la fonction fléchée dans le map()
    const dates = rawOrders.value.map(function (o) {
      const dateStr = extractText(o.date_add);
      if (dateStr) {
        return dateStr.slice(0, 10);
      }
      return null;
    });

    // Remplacement du "filter(Boolean)" par une condition explicite
    const validDates = dates.filter(function (date) {
      if (date !== null && date !== '') {
        return true;
      } else {
        return false;
      }
    });

    validDates.sort();

    if (validDates.length > 0) {
      startDate.value = validDates[0];
      endDate.value = validDates[validDates.length - 1];
    }
  }
}

onMounted(fetchData);
</script>

<template>
  <div class="dashboard-page">
    <header class="header-banner">
      <h1>Statistiques de Ventes</h1>
      <div class="filters">
        <input type="date" v-model="startDate">
        <span>→</span>
        <input type="date" v-model="endDate">
        <select v-model="aggregationInterval" class="select-interval">
          <option value="daily">Journalier</option>
          <option value="weekly">Hebdomadaire</option>
          <option value="monthly">Mensuel</option>
          <option value="yearly">Annuel</option>
        </select>
        <button class="btn-refresh" @click="fetchData">Actualiser</button>
      </div>
    </header>

    <div class="main-content">
      <StatistiqueVente :stats="salesStats" />
      <MeilleurProduit :produits="topProducts" />
    </div>
  </div>
</template>

<style scoped>
.dashboard-page {
  padding: 30px;
  background: #f4f7fa;
  min-height: 100vh;
  font-family: 'Inter', sans-serif;
}

.header-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #1e293b;
  padding: 30px 40px;
  border-radius: 20px;
  color: white;
  margin-bottom: 30px;
}

.header-banner h1 {
  margin: 0;
  font-size: 1.8rem;
  font-weight: 800;
}

.filters {
  display: flex;
  align-items: center;
  gap: 15px;
}

.filters input,
.select-interval {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 12px;
  border-radius: 10px;
  outline: none;
}

.select-interval option {
  background: #1e293b;
  color: white;
}

.btn-refresh {
  background: #3b82f6;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
}

.btn-refresh:hover {
  background: #2563eb;
}

.main-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 25px;
  align-items: start;
}
</style>