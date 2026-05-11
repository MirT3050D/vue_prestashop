<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router'

const is_connected = ref("");
const router = useRouter();
const identifiant = ref("admin");
const mot_de_passe = ref("admin");
onMounted(() => {
	if (localStorage.getItem("login") == null) {
		const login = {
			identifiant : "admin",
			mot_de_passe: "admin"	
		}
		localStorage.setItem('login', JSON.stringify(login));
	}
})
function login() {
	const login = JSON.parse(localStorage.getItem("login"));
	console.log("login",login);
	console.log("identifiant =", identifiant.value, " mot de passe ", mot_de_passe.value);
	if (identifiant.value == login.identifiant && mot_de_passe.value == login.mot_de_passe){
		is_connected.value = "mon_token_123";
		localStorage.setItem('token', JSON.stringify(is_connected.value));
		console.log("is_conncted",is_connected.value);
		router.push("/backOfficeDashboard");
	}
}
</script>
<template>
	<div class="login-page">
		<section class="login-hero">
			<div class="brand-chip">ADMIN SHOP</div>
			<h1>Connexion securisee</h1>
			<p>
				Accedez a votre espace de gestion pour piloter les produits, les commandes
				et les outils de maintenance.
			</p>

			<div class="hero-metrics">
				<div>
					<strong>24/7</strong>
					<span>suivi de boutique</span>
				</div>
				<div>
					<strong>API</strong>
					<span>connexion admin</span>
				</div>
				<div>
					<strong>SAFE</strong>
					<span>acces controle</span>
				</div>
			</div>
		</section>

		<section class="login-card">
			<header class="card-header">
				<p class="eyebrow">Bienvenue</p>
				<h2>Se connecter</h2>
				<p class="subtitle">
					Utilisez vos identifiants administrateur pour ouvrir la session.
				</p>
			</header>

			<form class="login-form" @submit.prevent="login">
				<div class="field">
					<label for="email">Indentifiant</label>
					<input v-model="identifiant" id="email" name="email" placeholder="admin@shop.local"
						value="admin" />
				</div>

				<div class="field">
					<label for="password">Mot de passe</label>
					<input v-model="mot_de_passe" id="password" type="password" name="password"
						placeholder="Votre mot de passe" value="admin" autocomplete="admin"/>
				</div>

				<div class="form-row">
					<label class="remember-me">
						<input type="checkbox" name="remember" />
						<span>Se souvenir de moi</span>
					</label>


				</div>

				<button type="submit" class="login-button">Connexion</button>

				<p class="form-note">
					Cette page contient uniquement le template. Aucune logique de connexion n'est definie ici.
				</p>
			</form>

			<footer class="card-footer">
				<span>Acces reserve au back-office</span>
				<span>PrestaShop API ready</span>
			</footer>
		</section>
	</div>
</template>

<style scoped>
.login-page {
	min-height: 100vh;
	display: grid;
	grid-template-columns: minmax(0, 1.1fr) minmax(360px, 460px);
	background:
		radial-gradient(circle at top left, rgba(59, 130, 246, 0.22), transparent 34%),
		radial-gradient(circle at bottom right, rgba(14, 165, 233, 0.16), transparent 28%),
		linear-gradient(135deg, #0f172a 0%, #111827 48%, #e2e8f0 48%, #f8fafc 100%);
}

.login-hero {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 22px;
	padding: 64px;
	color: #f8fafc;
}

.brand-chip {
	width: fit-content;
	padding: 10px 14px;
	border-radius: 999px;
	background: rgba(15, 23, 42, 0.45);
	border: 1px solid rgba(148, 163, 184, 0.22);
	font-size: 0.72rem;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	font-weight: 700;
}

.login-hero h1 {
	margin: 0;
	font-size: clamp(2.4rem, 4vw, 4.5rem);
	line-height: 0.96;
	max-width: 10ch;
}

.login-hero p {
	margin: 0;
	max-width: 42rem;
	font-size: 1.05rem;
	line-height: 1.7;
	color: rgba(226, 232, 240, 0.86);
}

.hero-metrics {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 14px;
	max-width: 44rem;
}

.hero-metrics div {
	padding: 16px 18px;
	border-radius: 18px;
	background: rgba(15, 23, 42, 0.42);
	border: 1px solid rgba(148, 163, 184, 0.16);
}

.hero-metrics strong {
	display: block;
	margin-bottom: 6px;
	font-size: 1.05rem;
	color: #fff;
}

.hero-metrics span {
	font-size: 0.88rem;
	color: rgba(226, 232, 240, 0.72);
}

.login-card {
	align-self: center;
	justify-self: end;
	width: min(100%, 460px);
	margin: 32px;
	padding: 32px;
	border-radius: 28px;
	background: rgba(255, 255, 255, 0.92);
	border: 1px solid rgba(148, 163, 184, 0.18);
	box-shadow: 0 24px 60px rgba(15, 23, 42, 0.18);
	backdrop-filter: blur(14px);
}

.card-header {
	display: grid;
	gap: 8px;
	margin-bottom: 28px;
}

.eyebrow {
	margin: 0;
	font-size: 0.72rem;
	letter-spacing: 0.22em;
	text-transform: uppercase;
	color: #64748b;
	font-weight: 700;
}

.card-header h2 {
	margin: 0;
	font-size: 2rem;
	color: #0f172a;
}

.subtitle {
	margin: 0;
	color: #475569;
	line-height: 1.6;
}

.login-form {
	display: grid;
	gap: 18px;
}

.field {
	display: grid;
	gap: 8px;
}

.field label {
	font-size: 0.92rem;
	font-weight: 700;
	color: #0f172a;
}

.field input {
	border: 1px solid #cbd5e1;
	border-radius: 14px;
	padding: 14px 16px;
	font-size: 1rem;
	background: #fff;
	color: #0f172a;
}

.field input:focus {
	outline: 2px solid rgba(59, 130, 246, 0.24);
	border-color: #3b82f6;
}

.form-row {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 12px;
}

.remember-me {
	display: inline-flex;
	align-items: center;
	gap: 10px;
	color: #334155;
	font-size: 0.92rem;
}

.remember-me input {
	width: 16px;
	height: 16px;
	margin: 0;
}

.forgot-link {
	color: #1d4ed8;
	text-decoration: none;
	font-weight: 700;
	font-size: 0.92rem;
}

.login-button {
	border: none;
	border-radius: 14px;
	padding: 14px 18px;
	background: linear-gradient(135deg, #1d4ed8, #2563eb 55%, #38bdf8);
	color: #fff;
	font-size: 1rem;
	font-weight: 800;
	cursor: pointer;
	box-shadow: 0 16px 28px rgba(37, 99, 235, 0.24);
}

.form-note {
	margin: 0;
	font-size: 0.86rem;
	line-height: 1.6;
	color: #64748b;
}

.card-footer {
	display: flex;
	justify-content: space-between;
	gap: 12px;
	margin-top: 26px;
	padding-top: 18px;
	border-top: 1px solid rgba(148, 163, 184, 0.18);
	font-size: 0.82rem;
	color: #64748b;
}

@media (max-width: 980px) {
	.login-page {
		grid-template-columns: 1fr;
		background: linear-gradient(180deg, #0f172a 0%, #111827 42%, #f8fafc 42%, #f8fafc 100%);
	}

	.login-hero {
		padding: 40px 24px 20px;
	}

	.login-card {
		justify-self: stretch;
		margin: 0 24px 32px;
	}
}

@media (max-width: 640px) {
	.login-hero {
		padding: 32px 20px 18px;
	}

	.hero-metrics {
		grid-template-columns: 1fr;
	}

	.login-card {
		margin: 0 16px 24px;
		padding: 24px;
		border-radius: 22px;
	}

	.form-row,
	.card-footer {
		flex-direction: column;
		align-items: flex-start;
	}
}
</style>
