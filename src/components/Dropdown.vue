<script setup>
import { ref } from 'vue';
import { Icon } from '@iconify/vue';

// ============================================================================
// DÉFINITION DES PROPRIÉTÉS (PROPS)
// ============================================================================
// dropdown_title: Texte ou Objet contenant le libellé et l'icône du bouton principal
// contents: Tableau d'objets contenant les liens (label, url) à afficher dans le menu déroulant
const props = defineProps(['dropdown_title', 'contents']);

// État réactif pour savoir si le menu est ouvert ou fermé
const click = ref(false);

/**
 * Bascule l'état d'ouverture du menu déroulant (Toggle)
 */
function clickOnDropDown() {
    if (click.value) {
        click.value = false;
    }
    else {
        click.value = true;
    }
}
</script>

<template>
    <!-- Conteneur principal du composant -->
    <div class="boite">
        <!-- En-tête cliquable (Titre + Icône) -->
        <h3>
            <!-- Affichage conditionnel de l'icône de titre -->
            <Icon
                v-if="dropdown_title?.icon"
                class="title-icon"
                :icon="dropdown_title.icon"
                width="18"
                height="18"
            />
            <!-- Titre du menu (gère les cas string simple ou objet) -->
            <span>{{ dropdown_title?.label ?? dropdown_title }}</span>
        </h3>
        
        <!-- Chevron animé pour indiquer l'état (ouvert/fermé) -->
        <Icon
            icon="nrk:arrow-dropdown"
            width="24"
            height="24"
            :class="{ open: click }"
            @click="clickOnDropDown"
        />
        
        <!-- Corps du menu déroulant (Visible uniquement si click == true) -->
        <div class="elements" v-if="click">
            <!-- Emplacement dynamique (slot). Permet au composant parent d'injecter du HTML personnalisé 
                 Si rien n'est injecté, le <ul> ci-dessous est affiché par défaut. -->
            <slot>
                <ul>
                    <!-- Boucle sur les liens fournis en Props -->
                    <li v-for="content in contents" :key="content.url || content.label">
                        <!-- Navigation interne via Vue Router -->
                        <RouterLink :to="content.url">
                            {{ content.label }}
                        </RouterLink>
                    </li>
                </ul>
            </slot>
        </div>
    </div>
</template>

<style scoped>
/* Style de la "boîte" principale (Design moderne, fond sombre transparent, effet glassmorphism) */
.boite {
    --text: #e2e8f0;
    --accent: #38bdf8;
    background: rgba(15, 23, 42, 0.45);
    border: 1px solid rgba(148, 163, 184, 0.16);
    color: var(--text);
    border-radius: 14px;
    padding: 18px 20px;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
    display: grid;
    /* 1 colonne élastique pour le titre, 1 colonne auto pour le chevron */
    grid-template-columns: 1fr auto;
    align-items: center;
    gap: 8px 12px;
    max-width: 520px;
    transition: box-shadow 200ms ease, transform 200ms ease;
}

/* Animation au survol de la boîte (légère élévation) */
.boite:hover {
    box-shadow: 0 12px 28px rgba(37, 99, 235, 0.16);
    transform: translateY(-1px);
}

.boite h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: 0.2px;
    display: flex;
    align-items: center;
    gap: 8px;
}

.boite :deep(.title-icon) {
    flex-shrink: 0;
}

/* Style du chevron interactif */
.boite :deep(svg) {
    color: var(--accent);
    padding: 6px;
    border-radius: 50%;
    cursor: pointer;
    transition: transform 200ms ease;
}

/* Rotation à 180° du chevron quand le menu est ouvert */
.boite :deep(svg).open {
    transform: rotate(180deg);
}

/* Petit rebond du chevron au survol */
.boite :deep(svg):hover {
    animation: iconPop 200ms ease-out;
}

/* Conteneur des éléments (les liens). Il prend toute la largeur (grid-column: 1 / -1) */
.elements {
    grid-column: 1 / -1;
    border-radius: 10px;
    padding: 10px 12px;
    margin-top: 6px;
    /* Animation d'apparition fluide */
    animation: dropdownFade 180ms ease-out;
    background: rgba(15, 23, 42, 0.58);
}

.elements ul {
    list-style: none;
    padding: 0;
    margin: 0;
}

/* Style de chaque lien du menu */
.elements li {
    padding: 8px 10px;
    border-radius: 8px;
    color: #e2e8f0;
    transition: color 160ms ease, background 160ms ease;
}

.elements a {
    color: inherit;
    text-decoration: none;
    display: block; /* Rend toute la zone cliquable */
}

/* Effet néon bleu au survol des liens */
.elements li:hover {
    color: #ffffff;
    background: rgba(56, 189, 248, 0.14);
}

/* ============================================================================
   ANIMATIONS CSS (KEYFRAMES)
   ============================================================================ */

/* Fait glisser le menu vers le bas tout en apparaissant */
@keyframes dropdownFade {
    from {
        opacity: 0;
        transform: translateY(-4px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Fait "popper" (grossir puis réduire) l'icône chevron au survol */
@keyframes iconPop {
    0% {
        transform: scale(1);
    }
    60% {
        transform: scale(1.08);
    }
    100% {
        transform: scale(1);
    }
}
</style>