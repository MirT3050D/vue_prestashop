<script setup>

import { ref } from 'vue';
import { useRouter } from 'vue-router';
import LoginForm from '@/components/LoginForm.vue';
import { loginFront } from '@/service/authService';
import { getCustomers } from '@/service/customerService';

const emit = defineEmits(['login-success']);
const router = useRouter();
const loading = ref(false);
const error = ref('');

async function handleLogin(credentials) {
    loading.value = true;
    error.value = '';

    try {
        // 1. Appel vers authService
        const loginResponse = await loginFront(credentials.email, credentials.password);

        // 2. Vérifier si le login a réussi
        const responseText = typeof loginResponse.data === 'string' ? loginResponse.data : '';
        const isLoginFailed = responseText.includes('authentication') && responseText.includes('alert-danger');

        if (isLoginFailed) {
            error.value = 'Email ou mot de passe incorrect.';
            loading.value = false;
            return;
        }

        // 3. Récupérer les informations du customer via le WebService API
        let customerData = null;
        try {
            const customers = await getCustomers(`display=full&filter[email]=[${credentials.email}]`);

            if (customers.length > 0) {
                let c = customers[0];

                // Extraire les textes des champs langue si nécessaire
                function extractText(field) {
                    if (!field) return '';
                    if (typeof field === 'string') return field;
                    if (field.language) {
                        if (Array.isArray(field.language)) return field.language[0]['#text'] || '';
                        return field.language['#text'] || '';
                    }
                    return field['#text'] || String(field);
                }

                customerData = {
                    id: c.id,
                    email: extractText(c.email) || credentials.email,
                    firstname: extractText(c.firstname),
                    lastname: extractText(c.lastname),
                    id_gender: c.id_gender,
                    birthday: extractText(c.birthday),
                    active: c.active
                };
            }
        } catch (apiError) {
            console.log('Impossible de récupérer les infos client via WebService:', apiError);
            // On continue quand même — on stocke au minimum l'email
            customerData = {
                email: credentials.email
            };
        }

        // 4. Stocker dans le localStorage
        const token = 'customer_' + Date.now() + '_' + Math.random().toString(36).substring(2);
        localStorage.setItem('customer_token', JSON.stringify(token));
        localStorage.setItem('customer', JSON.stringify(customerData));
        window.dispatchEvent(new Event('customer-updated'));

        // 5. Émettre l'événement de succès
        emit('login-success');

        // 6. Rediriger vers l'accueil
        router.push('/');

    } catch (err) {
        console.error('Erreur lors de la connexion:', err);

        if (err.response && err.response.status === 401) {
            error.value = 'Email ou mot de passe incorrect.';
        } else if (err.code === 'ERR_NETWORK') {
            error.value = 'Impossible de joindre le serveur PrestaShop.';
        } else {
            error.value = 'Une erreur est survenue lors de la connexion. Veuillez réessayer.';
        }
    } finally {
        loading.value = false;
    }
}
</script>

<template>
    <div class="login-view">
        <div class="login-container">
            <LoginForm
                :loading="loading"
                :error="error"
                @submit="handleLogin"
            />
        </div>
    </div>
</template>

<style scoped>
.login-view {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    font-family: 'Inter', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    background:
        radial-gradient(circle at top left, rgba(46, 213, 115, 0.08), transparent 40%),
        radial-gradient(circle at bottom right, rgba(47, 53, 66, 0.06), transparent 40%),
        #f8f9fa;
}

.login-container {
    width: 100%;
    max-width: 440px;
}
</style>
