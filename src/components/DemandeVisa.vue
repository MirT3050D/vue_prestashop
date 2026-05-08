<script setup>
import { ref } from 'vue'
const props = defineProps(['demandeVisa']);
console.log("demandevisa", props.demandeVisa);
const dropdown = ref("false")
function toggle() {
    if (dropdown.value == true) {
        dropdown.value = false;
    }
    else {
        dropdown.value = true;
    }
}
</script>

<template>
    <div class="boite"">
        <table>
            <th>id</th>
            <th>date demande</th>
            <th>type demande visa</th>
            <th>numero passeport</th>
            <th>est verouille</th>
            <tr>
                <td>{{ demandeVisa.id }}</td>
                <td>{{ demandeVisa.dateDemande }}</td>
                <td>{{ demandeVisa.typeDemandeVisa?.label }}</td>
                <td>{{ demandeVisa.passeport?.numPasseport }}</td>
                <td>{{ demandeVisa.estVerrouille ? 'oui' : 'non' }}</td>
            </tr>
        </table>
         <button @click="toggle">Toggle</button>
        <div v-if="dropdown == true">
            Menu
        </div>
    </div>
</template>

<style scoped></style>