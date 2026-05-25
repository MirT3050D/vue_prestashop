<script setup>
import { ref } from 'vue'
import { Icon } from '@iconify/vue'

// ============================================================================
// DÉFINITION DES PROPRIÉTÉS (PROPS)
// ============================================================================
const props = defineProps({
    // État de chargement (désactive le bouton et affiche le spinner)
    loading: { type: Boolean, default: false },
    // Message d'erreur à afficher en rouge en haut du formulaire
    error: { type: String, default: '' },
    // Titre principal du formulaire
    title: { type: String, default: 'Connexion' },
    // Sous-titre descriptif
    subtitle: { type: String, default: 'Veuillez vous connecter' },
    // Comportement de l'autocomplétion du navigateur. 
    // Si 'admin', pré-remplit les champs avec "admin" (utile en dev)
    autocomplete: { type: String, default: 'on' }
})

// ============================================================================
// GESTION DES ÉVÉNEMENTS (EMITS)
// ============================================================================
// Émet un événement 'submit' contenant l'email et le mot de passe quand l'utilisateur valide
const emit = defineEmits(['submit'])

// ============================================================================
// ÉTATS RÉACTIFS (VARIABLES)
// ============================================================================
const email = ref(props.autocomplete === 'admin' ? 'admin' : '')
const password = ref(props.autocomplete === 'admin' ? 'admin' : '')
// Contrôle l'affichage en clair ou caché du mot de passe
const showPassword = ref(false)

// ============================================================================
// MÉTHODES
// ============================================================================
/**
 * Intercepte la soumission du formulaire et envoie les données au composant parent.
 */
function handleSubmit() {
    emit('submit', {
        email: email.value,
        password: password.value
    })
}
</script>

<template>
    <!-- Carte principale du formulaire de connexion -->
    <div class="login-card">
        <!-- En-tête : Icône, Titre, Sous-titre -->
        <div class="login-header">
            <div class="login-icon-wrapper">
                <Icon icon="lucide:user-circle" class="login-icon" />
            </div>
            <h2 class="login-title">{{ title }}</h2>
            <p class="login-subtitle">{{ subtitle }}</p>
        </div>

        <!-- Bannière d'erreur (Visible uniquement si la prop 'error' est remplie) -->
        <div v-if="error" class="error-banner">
            <Icon icon="lucide:alert-circle" />
            <span>{{ error }}</span>
        </div>

        <!-- Formulaire de connexion (Empêche le rechargement de page via @submit.prevent) -->
        <form class="login-form" @submit.prevent="handleSubmit">
            
            <!-- Champ : E-mail -->
            <div class="field-group">
                <label for="login-email" class="field-label">
                    <Icon icon="lucide:mail" class="field-icon" />
                    Identifiant / E-mail
                </label>
                <input
                    id="login-email"
                    v-model="email"
                    type="text"
                    placeholder="Votre identifiant"
                    required
                    :autocomplete="autocomplete === 'on' ? 'email' : autocomplete"
                    class="field-input"
                />
            </div>

            <!-- Champ : Mot de passe -->
            <div class="field-group">
                <label for="login-password" class="field-label">
                    <Icon icon="lucide:lock" class="field-icon" />
                    Mot de passe
                </label>
                <div class="password-wrapper">
                    <!-- Type dynamique: 'text' si showPassword est vrai, sinon 'password' -->
                    <input
                        id="login-password"
                        v-model="password"
                        :type="showPassword ? 'text' : 'password'"
                        placeholder="Votre mot de passe"
                        required
                        :autocomplete="autocomplete === 'on' ? 'current-password' : autocomplete"
                        class="field-input"
                    />
                    <!-- Bouton en forme d'œil pour afficher/masquer le mot de passe -->
                    <button
                        type="button"
                        class="toggle-password"
                        @click="showPassword = !showPassword"
                        :title="showPassword ? 'Masquer' : 'Afficher'"
                    >
                        <Icon :icon="showPassword ? 'lucide:eye-off' : 'lucide:eye'" />
                    </button>
                </div>
            </div>

            <!-- Bouton de validation -->
            <button type="submit" class="submit-btn" :disabled="loading">
                <!-- Affiche un spinner de chargement si loading est true -->
                <Icon v-if="loading" icon="lucide:loader-2" class="spin" />
                <Icon v-else icon="lucide:log-in" />
                {{ loading ? 'Connexion...' : 'Se connecter' }}
            </button>
        </form>
    </div>
</template>

<style scoped>
/* Design général de la carte (Centrée, blanche, ombre douce) */
.login-card {
    width: 100%;
    max-width: 440px;
    background: #ffffff;
    border-radius: 24px;
    padding: 40px 36px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.08);
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}

/* === HEADER === */
.login-header {
    text-align: center;
    margin-bottom: 32px;
}

.login-icon-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: linear-gradient(135deg, rgba(46, 213, 115, 0.15), rgba(46, 213, 115, 0.05));
    margin-bottom: 16px;
}

.login-icon {
    font-size: 2rem;
    color: #2ed573;
}

.login-title {
    margin: 0;
    font-size: 1.6rem;
    font-weight: 800;
    color: #2f3542;
    letter-spacing: -0.5px;
}

.login-subtitle {
    margin: 8px 0 0;
    font-size: 0.95rem;
    color: #747d8c;
}

/* === ERROR === */
.error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 18px;
    background: #fff0f0;
    border: 1px solid #ffcdd2;
    border-radius: 12px;
    color: #d32f2f;
    font-size: 0.9rem;
    font-weight: 500;
    margin-bottom: 24px;
}

/* === FORM === */
.login-form {
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.field-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.field-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 600;
    color: #2f3542;
}

.field-icon {
    font-size: 1rem;
    color: #747d8c;
}

.field-input {
    width: 100%;
    padding: 14px 16px;
    border: 1.5px solid #e4e7eb;
    border-radius: 12px;
    font-size: 1rem;
    color: #2f3542;
    background: #f8f9fa;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
    box-sizing: border-box;
}

.field-input:focus {
    border-color: #2ed573;
    box-shadow: 0 0 0 3px rgba(46, 213, 115, 0.12);
    background: #ffffff;
}

.field-input::placeholder {
    color: #a4b0be;
}

/* Positionnement de l'icône oeil dans le champ mot de passe */
.password-wrapper {
    position: relative;
}

.password-wrapper .field-input {
    padding-right: 48px;
}

.toggle-password {
    position: absolute;
    right: 14px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #a4b0be;
    cursor: pointer;
    font-size: 1.1rem;
    display: flex;
    align-items: center;
    transition: color 0.2s ease;
}

.toggle-password:hover {
    color: #2f3542;
}

/* === SUBMIT === */
.submit-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    padding: 16px;
    margin-top: 8px;
    background: linear-gradient(135deg, #2f3542, #4a5568);
    color: white;
    border: none;
    border-radius: 14px;
    font-size: 1.05rem;
    font-weight: 700;
    cursor: pointer;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    box-shadow: 0 4px 15px rgba(47, 53, 66, 0.2);
}

.submit-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(47, 53, 66, 0.3);
}

.submit-btn:active:not(:disabled) {
    transform: translateY(0);
}

.submit-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* === ANIMATION === */
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.spin {
    animation: spin 1s linear infinite;
}

/* === RESPONSIVE === */
@media (max-width: 480px) {
    .login-card {
        padding: 28px 20px;
        border-radius: 18px;
    }

    .login-title {
        font-size: 1.4rem;
    }
}
</style>
