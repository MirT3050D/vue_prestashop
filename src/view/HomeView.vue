<script setup>
import { ref } from "vue";
import { api } from "../service/api";

// Variables réactives pour le formulaire de test
const query = ref("");        // La valeur tapée dans le champ de recherche
const data = ref([]);         // Les résultats reçus de l'API
const erreur = ref("");       // Le message d'erreur si l'appel échoue
const isLoading = ref(false); // État de chargement

/**
 * Fonction déclenchée au clic sur "Tester l'API" ou en appuyant sur Entrée.
 * Elle effectue une requête GET sur le endpoint '/addresses' de PrestaShop.
 */
async function tryApi() {
    erreur.value = "";
    isLoading.value = true;

    try {
        // Envoi de la requête via notre instance Axios configurée
        const response = await api.get("/addresses", {
            params: {
                display: "full", // Demande à PrestaShop de renvoyer tous les champs de l'adresse
                q: query.value || undefined // Paramètre de recherche optionnel
            }
        });
        
        // Sécurise la réponse en s'assurant que ce soit bien un tableau
        data.value = Array.isArray(response.data) ? response.data : [];
    } catch (error) {
        // En cas d'erreur réseau ou d'API (ex: 401 Unauthorized)
        data.value = [];
        erreur.value = error;
    } finally {
        // Dans tous les cas (succès ou échec), on arrête le chargement
        isLoading.value = false;
    }
}
</script>

<template>
    <!-- Conteneur principal de la vue -->
    <div class="main">
        
        <!-- En-tête (Hero) expliquant le but de cette page -->
        <header class="hero">
            <div>
                <p class="eyebrow">Test API</p>
                <h1>Verifier les adresses en temps reel</h1>
                <p class="subtitle">
                    Saisis une reference et lance l'appel pour voir les donnees s'afficher.
                </p>
            </div>
        </header>

        <!-- Panneau principal contenant la recherche et les résultats -->
        <section class="panel">
            
            <!-- Barre de recherche -->
            <div class="recherche">
                <!-- Champ de texte lié à 'query' (v-model) -->
                <!-- @keyup.enter permet de lancer tryApi si on tape sur 'Entrée' -->
                <input
                    v-model="query"
                    type="text"
                    placeholder="Reference de passeport ou demande"
                    @keyup.enter="tryApi"
                />
                
                <!-- Bouton d'action (Désactivé pendant le chargement) -->
                <button class="action" type="button" @click="tryApi" :disabled="isLoading">
                    {{ isLoading ? "Chargement..." : "Tester l'API" }}
                </button>
            </div>

            <!-- Message affiché si la recherche n'a rien donné -->
            <p v-if="!data.length && !erreur" class="empty">
                Aucun resultat pour le moment.
            </p>

            <!-- Zone de résultats (Affichage brut du JSON) -->
            <div class="resultat" v-if="Array.isArray(data) && data.length && erreur === ''">
                <ul>
                    <li v-for="(item, index) in data" :key="index">
                        <!-- <pre> conserve l'indentation et les sauts de ligne du JSON -->
                        <pre>{{ item }}</pre>
                    </li>
                </ul>
            </div>

            <!-- Zone d'erreur -->
            <div v-else-if="erreur" class="error">
                <p>Erreur lors de l'execution de l'api.</p>
                <pre>{{ erreur }}</pre>
            </div>
        </section>
    </div>
</template>

<style scoped>
/* Le style est volontairement gardé simple et fonctionnel pour ce composant de test */
.main {
    padding: 32px 24px;
    display: grid;
    gap: 24px;
}

.hero {
    display: grid;
    gap: 12px;
}

/* Style de sur-titre (petites lettres majuscules espacées) */
.eyebrow {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.2rem;
    color: #64748b;
    margin: 0;
}

.hero h1 {
    font-size: 2rem;
    margin: 0;
    color: #0f172a;
}

.subtitle {
    margin: 0;
    color: #475569;
}

/* Carte blanche avec ombre qui contient le formulaire */
.panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    display: grid;
    gap: 16px;
}

/* Grille pour aligner l'input et le bouton côte à côte */
.recherche {
    display: grid;
    grid-template-columns: 1fr auto; /* L'input prend tout l'espace restant, le bouton prend juste ce qu'il lui faut */
    gap: 12px;
}

.recherche input {
    border: 1px solid #cbd5f5;
    border-radius: 10px;
    padding: 12px 14px;
    font-size: 0.95rem;
}

.recherche input:focus {
    outline: 2px solid rgba(59, 130, 246, 0.25);
    border-color: #3b82f6;
}

/* Bouton bleu */
.action {
    border: none;
    border-radius: 10px;
    padding: 0 18px;
    background: #1d4ed8;
    color: #ffffff;
    font-weight: 600;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 160ms ease;
}

/* État désactivé pendant la requête API */
.action:disabled {
    cursor: not-allowed;
    opacity: 0.7;
    box-shadow: none;
}

.action:not(:disabled):hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 18px rgba(29, 78, 216, 0.25);
}

.empty {
    margin: 0;
    color: #94a3b8;
}

/* Zone d'affichage des résultats */
.resultat ul {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 12px;
}

.resultat li {
    border-radius: 12px;
    background: #f8fafc;
    padding: 12px;
    /* Permet de scroller si le JSON est trop grand */
    overflow: auto;
}

.resultat pre {
    margin: 0;
    white-space: pre-wrap; /* Le texte va à la ligne s'il dépasse */
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    color: #0f172a;
}

/* Bannière d'erreur rouge */
.error {
    border-radius: 12px;
    background: #fff1f2;
    padding: 12px;
    color: #b91c1c;
}

.error pre {
    margin: 8px 0 0;
    white-space: pre-wrap;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
}

/* Sur petit écran, le champ et le bouton passent l'un en dessous de l'autre */
@media (max-width: 720px) {
    .recherche {
        grid-template-columns: 1fr;
    }

    .action {
        height: 44px;
    }
}
</style>