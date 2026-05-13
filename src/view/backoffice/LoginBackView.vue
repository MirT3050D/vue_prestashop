<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import LoginForm from '@/components/LoginForm.vue';

const router = useRouter();
const loading = ref(false);
const error = ref('');

onMounted(() => {
    // Initialisation des identifiants par défaut dans localStorage si absent
    if (localStorage.getItem("login") == null) {
        const login = {
            identifiant: "admin",
            mot_de_passe: "admin"
        }
        localStorage.setItem('login', JSON.stringify(login));
    }
});

function handleLogin(credentials) {
    loading.value = true;
    error.value = '';

    // On simule un délai pour le côté "premium"
    setTimeout(() => {
        const storedLogin = JSON.parse(localStorage.getItem("login"));
        
        // On compare les identifiants (identifiant = email dans le composant)
        if (credentials.email === storedLogin.identifiant && credentials.password === storedLogin.mot_de_passe) {
            const token = "mon_token_123_backoffice";
            localStorage.setItem('token', JSON.stringify(token));
            router.push("/import");
        } else {
            error.value = "Identifiants administrateur incorrects.";
        }
        loading.value = false;
    }, 800);
}
</script>

<template>
    <div class="admin-login-page">
        <!-- Section décorative Hero -->
        <section class="admin-hero">
            <div class="brand-chip">BACK-OFFICE</div>
            <h1>Système de Gestion</h1>
            <p>
                Interface sécurisée pour l'administration de votre boutique. 
                Gérez vos produits, commandes et clients en toute simplicité.
            </p>

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

        <!-- Section Formulaire -->
        <section class="admin-form-container">
            <LoginForm 
                :loading="loading" 
                :error="error" 
                title="Espace Admin"
                subtitle="Accès réservé au personnel autorisé"
                @submit="handleLogin"
            />
            
            <p class="admin-footer-text">
                &copy; 2026 AdminShop. Accès réservé aux administrateurs.
            </p>
        </section>
    </div>
</template>

<style scoped>
.admin-login-page {
    min-height: 100vh;
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    background-color: #0f172a;
    font-family: 'Inter', sans-serif;
}

.admin-hero {
    padding: 64px;
    display: flex;
    flex-direction: column;
    justify-content: center;
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

.admin-form-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px;
    background: #f8fafc;
    position: relative;
    border-radius: 40px 0 0 40px;
}

:deep(.login-title) { color: #1e293b; }
:deep(.login-header .login-icon) { color: #1e293b; }
:deep(.login-header .login-icon-wrapper) { background: rgba(30, 41, 59, 0.05); }
:deep(.submit-btn) { background: linear-gradient(135deg, #1e293b, #334155); }

.admin-footer-text {
    margin-top: 32px;
    font-size: 0.85rem;
    color: #94a3b8;
}

@media (max-width: 1024px) {
    .admin-login-page { grid-template-columns: 1fr; }
    .admin-hero { padding: 40px 24px; text-align: center; align-items: center; }
    .admin-hero h1 { font-size: 2.5rem; }
    .admin-form-container { border-radius: 40px 40px 0 0; margin-top: -40px; padding: 60px 24px; }
}
</style>
