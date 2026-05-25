<script setup>
/**
 * @file LoginBackView.vue
 * @description Vue de connexion réservée à l'espace d'administration (Back-Office).
 * Elle gère l'authentification sécurisée des administrateurs via l'API, 
 * intègre un design de type split-screen pour l'UX, et initialise les identifiants par défaut pour le développement.
 */
// ============================================================================
// IMPORTATIONS
// ============================================================================
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
// Importe le composant de formulaire réutilisable
import LoginForm from '@/components/LoginForm.vue';
import { initDefaultCredentials, authenticateBackoffice } from '@/service/authService';

// Variables
const router = useRouter();
const loading = ref(false); // Permet de mettre le bouton de connexion en état "Chargement"
const error = ref('');      // Permet d'afficher un message d'erreur rouge (ex: Mauvais mot de passe)

// Au montage, remplit potentiellement localStorage avec admin/admin pour le dev
onMounted(() => {
    initDefaultCredentials();
});

// ============================================================================
// MÉTHODES
// ============================================================================
/**
 * Fonction appelée par le composant enfant <LoginForm> lorsqu'on clique sur "Connexion".
 * @param {Object} credentials - L'objet contenant email et password
 */
async function handleLogin(credentials) {
    loading.value = true;
    error.value = '';

    // Appel du service de vérification
    const result = await authenticateBackoffice(credentials.email, credentials.password);
    
    if (result.success) {
        // Redirection vers le tableau de bord Admin si tout est ok
        router.push("/admin/backofficeDashboard");
    } else {
        // Sinon, remonte l'erreur (qui sera affichée par LoginForm)
        error.value = result.error || "Identifiants administrateur incorrects.";
    }
    
    loading.value = false;
}
</script>

<template>
    <!-- Page de connexion Admin stylisée en pleine largeur (Split screen) -->
    <div class="admin-login-page">
        
        <!-- Section décorative Hero (Partie Gauche) -->
        <section class="admin-hero">
            <div class="brand-chip">BACK-OFFICE</div>
            <h1>Système de Gestion</h1>
            <p>
                Interface sécurisée pour l'administration de votre boutique. 
                Gérez vos produits, commandes et clients en toute simplicité.
            </p>

            <!-- Badges décoratifs de sécurité -->
            <div class="admin-badges">
                <div class="badge">
                    <span class="badge-icon">🛡️</span>
                    <span>Accès Sécurisé</span>
                </div>
                <div class="badge">
                    <span class="badge-icon">⚡</span>
                    <span>Admin Ready</span>
                </div>
            </div>
        </section>

        <!-- Section Formulaire (Partie Droite) -->
        <section class="admin-form-container">
            <!-- Utilisation du composant LoginForm en lui passant les textes et événements spécifiques à l'admin -->
            <LoginForm 
                :loading="loading" 
                :error="error" 
                title="Espace Admin"
                subtitle="Accès réservé au personnel autorisé"
                autocomplete="admin"
                @submit="handleLogin"
            />
            
            <p class="admin-footer-text">
                &copy; 2026 AdminShop. Accès réservé aux administrateurs.
            </p>
        </section>
    </div>
</template>

<style scoped>
/* === LAYOUT GLOBAL === */
.admin-login-page {
    min-height: 100vh;
    display: grid;
    /* La partie gauche (1.1fr) est légèrement plus large que la partie droite (0.9fr) */
    grid-template-columns: 1.1fr 0.9fr;
    background-color: #0f172a;
    font-family: 'Inter', sans-serif;
}

/* === SECTION GAUCHE (HERO) === */
.admin-hero {
    padding: 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    /* Fond très complexe : Dégradé noir profond avec des sphères de lumières bleues et violettes */
    background: 
        radial-gradient(circle at 10% 20%, rgba(59, 130, 246, 0.1), transparent 40%),
        radial-gradient(circle at 90% 80%, rgba(147, 51, 234, 0.05), transparent 40%),
        linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    color: #f8fafc;
}

.brand-chip {
    width: fit-content;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 99px;
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 2px;
    color: #3b82f6;
    margin-bottom: 24px;
}

.admin-hero h1 {
    font-size: 4rem;
    font-weight: 800;
    margin: 0 0 20px 0;
    letter-spacing: -2px;
    line-height: 1;
}

.admin-hero p {
    font-size: 1.1rem;
    line-height: 1.6;
    color: #94a3b8;
    max-width: 480px;
    margin-bottom: 40px;
}

.admin-badges {
    display: flex;
    gap: 16px;
}

.badge {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 16px;
    font-size: 0.9rem;
    color: #cbd5e1;
}

/* === SECTION DROITE (CONTENEUR DU FORMULAIRE) === */
.admin-form-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: #f8fafc; /* Gris très clair / Blanc cassé */
    position: relative;
    /* Arrondit uniquement les coins gauches pour créer un effet d'insertion dans le fond noir */
    border-radius: 40px 0 0 40px;
}

/* Modification CSS ciblée : Le composant LoginForm utilise "scoped", donc pour modifier son style DEPUIS le parent, on utilise :deep() */
:deep(.login-title) { color: #1e293b; }
:deep(.login-header .login-icon) { color: #1e293b; }
:deep(.login-header .login-icon-wrapper) { background: rgba(30, 41, 59, 0.05); }
:deep(.submit-btn) { background: linear-gradient(135deg, #1e293b, #334155); }

.admin-footer-text {
    margin-top: 32px;
    font-size: 0.85rem;
    color: #94a3b8;
}

/* === RESPONSIVE === */
@media (max-width: 1024px) {
    /* Sur tablette, on empile les deux parties au lieu de les mettre côte à côte */
    .admin-login-page { grid-template-columns: 1fr; }
    .admin-hero { padding: 40px 24px; text-align: center; align-items: center; }
    .admin-hero h1 { font-size: 2.5rem; }
    
    /* Astuce design : On arrondit le haut pour créer un effet de "feuille" qui glisse sur la partie noire */
    .admin-form-container { border-radius: 40px 40px 0 0; margin-top: -40px; padding: 60px 24px; }
}
</style>
