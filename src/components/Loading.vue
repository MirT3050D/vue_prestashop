<template>
  <!-- Conteneur principal de l'animation, affiché uniquement si la variable isLoading est vraie (v-if) -->
  <!-- Les attributs aria-live et aria-busy sont là pour l'accessibilité (lecteurs d'écran) -->
  <div v-if="isLoading" class="loading" aria-live="polite" aria-busy="true">
    <!-- Premier point de l'animation -->
    <span class="dot" />
    <!-- Deuxième point de l'animation (avec un délai via CSS) -->
    <span class="dot" />
    <!-- Troisième point de l'animation (avec un délai plus long via CSS) -->
    <span class="dot" />
    <!-- Texte caché visuellement mais lisible par les lecteurs d'écran pour les malvoyants -->
    <span class="sr-only">Chargement...</span>
  </div>
</template>

<script setup>
// Définition des propriétés (props) acceptées par ce composant
defineProps({
  // Propriété 'isLoading' attendue depuis le composant parent
  isLoading: {
    type: Boolean, // Doit obligatoirement être un booléen (vrai/faux)
    required: true // Cette propriété est obligatoire pour utiliser le composant
  }
});
</script>

<style scoped>
/* Conteneur global de l'animation */
.loading {
  display: inline-flex; /* Permet d'aligner les points horizontalement */
  align-items: center; /* Centre les points verticalement */
  gap: 6px; /* Espace de 6 pixels entre chaque point */
  padding: 6px 8px; /* Marge intérieure légère */
}

/* Style de base pour chaque point de l'animation */
.dot {
  width: 8px; /* Largeur du point */
  height: 8px; /* Hauteur du point */
  border-radius: 50%; /* Arrondi parfait pour faire un cercle */
  background: currentColor; /* Prend la couleur du texte parent actuel */
  /* Lance l'animation 'pulse' qui dure 0.9s en boucle infinie */
  animation: pulse 0.9s ease-in-out infinite;
}

/* Cible spécifiquement le 2ème point pour décaler le début de son animation */
.dot:nth-child(2) {
  animation-delay: 0.15s;
}

/* Cible spécifiquement le 3ème point pour le décaler encore plus */
.dot:nth-child(3) {
  animation-delay: 0.3s;
}

/* Classe d'utilité pour cacher un élément visuellement tout en le laissant pour les lecteurs d'écran (Screen Readers) */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0); /* Coupe l'élément pour qu'il soit invisible */
  border: 0;
}

/* Définition de l'animation de pulsation (taille et opacité) */
@keyframes pulse {
  /* État initial et final : petit et semi-transparent */
  0%,
  100% {
    opacity: 0.3;
    transform: scale(0.85);
  }
  /* État intermédiaire (à la moitié de l'animation) : taille normale et opaque */
  50% {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
