# Composants Communs (Generic UI Components)

Ces composants réutilisables partagés par l'ensemble de l'application gèrent les animations, les formulaires de connexion et l'affichage des listes.

---

## 📂 Liste des Composants Génériques

### 1. `Loading.vue`
Un indicateur visuel animé représentant trois points de chargement synchronisés via CSS.
*   **Props** :
    *   `isLoading` : Booléen requis qui conditionne le rendu du loader.
*   **Animations** : Utilise une règle CSS `@keyframes pulse` qui modifie la taille et l'opacité des points avec un délai progressif de `0.15s` et `0.3s`.

---

### 2. `LoginForm.vue`
Formulaire d'authentification partagé par les interfaces de connexion administrateur et client.
*   **Props** :
    *   `loading` : Désactive le bouton de validation et affiche un spinner de chargement.
    *   `error` : Message d'erreur textuel à afficher au-dessus du formulaire en cas d'échec.
    *   `title` / `subtitle` : Libellés textuels personnalisables.
    *   `autocomplete` : Configurable (ex: `'admin'` pré-remplit les accès par défaut).
*   **Comportement** :
    *   Propose un commutateur oculaire (icône œil) pour masquer ou afficher le mot de passe en modifiant dynamiquement le type de l'input entre `text` et `password`.
    *   Émet un événement `submit` contenant un objet `{ email, password }`.

---

### 3. `Dropdown.vue`, `List.vue`, `Create.vue`, `Update.vue`
Ces composants forment l'architecture de base CRUD générique pour administrer les ressources PrestaShop.
*   **`Dropdown.vue`** : Liste déroulante personnalisée acceptant des filtres de sélection de champs de clés primaires.
*   **`List.vue`** : Table de données générique dynamique gérant l'affichage paginé ou trié.
*   **`Create.vue` / `Update.vue`** : Formulaires dynamiques générant automatiquement des champs à remplir en fonction du modèle XML à envoyer à l'API PrestaShop.
