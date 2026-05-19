# Vue Back-office : Connexion Administrateur (`LoginBackView.vue`)

Cette vue sécurise l'accès à l'espace d'administration du back-office.

---

## ⚙️ Fonctionnement et Logique Métier

1.  **Initialisation du profil Administrateur par défaut** :
    *   Si aucun profil de connexion n'est présent dans le `localStorage` de l'application à l'ouverture de la page, le script crée un compte local par défaut avec les identifiants :
        *   **Identifiant** : `admin`
        *   **Mot de passe** : `admin`
2.  **Simulation & Navigation** :
    *   Compare les identifiants soumis au formulaire avec ceux enregistrés en local.
    *   En cas de succès, elle stocke un jeton de session factice (`token`) dans le stockage local et redirige l'utilisateur vers le tableau de bord.
    *   Ce jeton est détecté et validé par le filtre de navigation global de Vue Router (`beforeEach`).

---

## 🛠️ Extraits de Code Clés

Voici le script de validation des identifiants et d'affectation de session dans `src/view/backoffice/LoginBackView.vue` :

```javascript
onMounted(() => {
    // Initialisation des identifiants par défaut dans localStorage si absent
    if (localStorage.getItem("login") == null) {
        const login = {
            identifiant: "admin",
            mot_de_passe: "admin"
        };
        localStorage.setItem('login', JSON.stringify(login));
    }
});

function handleLogin(credentials) {
    loading.value = true;
    error.value = '';

    // Simulation d'un délai d'authentification premium
    setTimeout(() => {
        const storedLogin = JSON.parse(localStorage.getItem("login"));
        
        // Comparaison avec les données saisies
        if (credentials.email === storedLogin.identifiant && credentials.password === storedLogin.mot_de_passe) {
            const token = "mon_token_123_backoffice";
            localStorage.setItem('token', JSON.stringify(token));
            router.push("/admin/backofficeDashboard");
        } else {
            error.value = "Identifiants administrateur incorrects.";
        }
        loading.value = false;
    }, 800);
}
```
