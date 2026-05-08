# Iconify (Vue)

## Installation

```bash
npm install @iconify/vue
```

## Utilisation rapidev

Dans un composant Vue (ex. App.vue) :

```vue
<script setup>
import { Icon } from "@iconify/vue";
</script>

<template>
  <Icon icon="mdi:cart" width="24" height="24" />
  <Icon icon="mdi:package-variant" width="24" height="24" />
  <Icon icon="mdi:store" width="24" height="24" />
</template>
```

## Tailles et couleurs

```vue
<Icon icon="mdi:cart" width="32" height="32" color="#1f2937" />
```

Tu peux aussi utiliser le CSS :

```vue
<Icon icon="mdi:cart" class="icon" />
```

```css
.icon {
  width: 24px;
  height: 24px;
  color: #111827;
}
```

## Choisir des icones

Iconify donne acces a des milliers d icones. Tu choisis une collection + un nom :

- Format : `<collection>:<nom>`
- Exemple : `mdi:cart`

Collections populaires :

- `mdi` (Material Design Icons)
- `ph` (Phosphor)
- `tabler` (Tabler Icons)
- `bx` (Boxicons)
- `fa6-solid` (Font Awesome 6)

## Comment trouver des icones

1) Ouvre https://icon-sets.iconify.design/
2) Cherche le nom d une icone (ex. cart, store, user, package)
3) Copie la clef (ex. `mdi:cart`)

## Exemples utiles pour e commerce

- `mdi:cart`
- `mdi:store`
- `mdi:package-variant`
- `mdi:truck`
- `mdi:credit-card`
- `mdi:barcode`
- `mdi:tag-outline`
- `mdi:account`

## Notes

- Evite d importer de grosses packs CSS, Iconify charge uniquement ce que tu utilises.
- Si tu veux un style unique, reste dans une seule collection (ex. `mdi`).
