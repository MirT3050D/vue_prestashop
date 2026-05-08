<script setup>
import { ref } from "vue";
import { api } from "../service/api";

const query = ref("");
const data = ref([]);
const erreur = ref("");
const isLoading = ref(false);

async function tryApi() {
    erreur.value = "";
    isLoading.value = true;

    try {
        const response = await api.get("/addresses", {
            params: {
                display: "full",
                q: query.value || undefined
            }
        });
        data.value = Array.isArray(response.data) ? response.data : [];
    } catch (error) {
        data.value = [];
        erreur.value = error;
    } finally {
        isLoading.value = false;
    }
}
</script>
<template>
    <div class="main">
        <header class="hero">
            <div>
                <p class="eyebrow">Test API</p>
                <h1>Verifier les adresses en temps reel</h1>
                <p class="subtitle">
                    Saisis une reference et lance l'appel pour voir les donnees s'afficher.
                </p>
            </div>
        </header>

        <section class="panel">
            <div class="recherche">
                <input
                    v-model="query"
                    type="text"
                    placeholder="Reference de passeport ou demande"
                    @keyup.enter="tryApi"
                />
                <button class="action" type="button" @click="tryApi" :disabled="isLoading">
                    {{ isLoading ? "Chargement..." : "Tester l'API" }}
                </button>
            </div>

            <p v-if="!data.length && !erreur" class="empty">
                Aucun resultat pour le moment.
            </p>

            <div class="resultat" v-if="Array.isArray(data) && data.length && erreur === ''">
                <ul>
                    <li v-for="(item, index) in data" :key="index">
                        <pre>{{ item }}</pre>
                    </li>
                </ul>
            </div>

            <div v-else-if="erreur" class="error">
                <p>Erreur lors de l'execution de l'api.</p>
                <pre>{{ erreur }}</pre>
            </div>
        </section>
    </div>
</template>
<style scoped>
.main {
    padding: 32px 24px;
    display: grid;
    gap: 24px;
}

.hero {
    display: grid;
    gap: 12px;
}

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

.panel {
    background: #ffffff;
    border-radius: 16px;
    padding: 20px;
    box-shadow: 0 12px 30px rgba(15, 23, 42, 0.08);
    display: grid;
    gap: 16px;
}

.recherche {
    display: grid;
    grid-template-columns: 1fr auto;
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
    overflow: auto;
}

.resultat pre {
    margin: 0;
    white-space: pre-wrap;
    font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
    color: #0f172a;
}

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

@media (max-width: 720px) {
    .recherche {
        grid-template-columns: 1fr;
    }

    .action {
        height: 44px;
    }
}
</style>