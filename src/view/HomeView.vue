<script setup>
import { ref, onMounted } from "vue"; // Ajoute par Amboara: ajout de onMounted
import { api } from "../service/api";
import DemandeVisa from "@/components/DemandeVisa.vue";
const data = ref([]);
const erreur = ref("");
async function tryApi() {
    console.log("oui")
    try {
        const response = await api.get('/addresses', {
            params: { display: 'full' }
        });
        data.value = response;
        erreur.value = "";
        console.log(data.value)
    } catch (error) {
        console.log(error);
        erreur.value = error;
    }
}
</script>
<template>
    <div class="main">
        <div class="recherche">
            <input type="text" placeholder="reference de passeport ou demande" @keyup.enter="tryApi">
        </div>
        <div class="resultat" v-if="Array.isArray(data) && data.length && erreur === ''">
            {{ data }}
        </div>
        <div v-else-if="erreur">
            <p>
                Erreur lors de l'execution de l'api {{ erreur }}
            </p>
        </div>
    </div>
</template>
<style scoped>
.boite {
    background-color: lightblue;
    padding: 20px;
}
</style>