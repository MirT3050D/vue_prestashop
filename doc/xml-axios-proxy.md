# XML + Axios + Proxy (Vue)

Ce document explique comment utiliser le parsing XML, le proxy Vite, et Axios dans ce projet.

## 1) Parsing XML (PrestaShop)

Le service XML est dans [vue/src/service/api.js](vue/src/service/api.js).

### Fonctions disponibles
- `parsePrestaXml(xmlString)` : parse un XML en objet JS.
- `buildPrestaXml(payload)` : construit un XML a partir d un objet JS.
- `getXml(url, config)` : GET + reponse XML parsee.
- `postXml(url, payload, config)` : POST XML (payload -> XML) + reponse parsee.
- `putXml(url, payload, config)` : PUT XML (payload -> XML) + reponse parsee.
- `deleteXml(url, config)` : DELETE + reponse parsee.

### Installation de la lib
```bash
npm install fast-xml-parser
```

### Exemple GET XML
```js
import { getXml } from '@/service/api';

const products = await getXml('/products');
console.log(products);
```

### Exemple POST XML
```js
import { postXml } from '@/service/api';

const payload = {
  prestashop: {
    product: {
      name: { language: { '@_id': '1', '#text': 'New product' } },
      link_rewrite: { language: { '@_id': '1', '#text': 'new-product' } },
      id_category_default: 2,
      price: 9.99,
      active: 1
    }
  }
};

await postXml('/products', payload);
```

Notes:
- Les attributs XML sont sous `@_`.
- Le texte d un noeud peut etre mis dans `#text`.

## 2) Proxy Vite (dev)

La config proxy est dans [vue/vite.config.js](vue/vite.config.js).

### Regle actuelle
```js
server: {
  proxy: {
    '/api_ps': {
      target: 'http://localhost:8080/prestashop_edition_classic_version_8.2.6/api',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api_ps/, '')
    }
  }
}
```

### Ce que ca fait
- Toute requete vers `/api_ps/...` est envoyee vers PrestaShop.
- Le prefixe `/api_ps` est retire.

### Exemple de route
- Appel front : `/api_ps/products`
- Appel backend : `http://localhost:8080/prestashop_edition_classic_version_8.2.6/api/products`

### Conseille pour Axios
- Definir `VITE_API_URL=/api_ps` en dev
- Ainsi, `getXml('/products')` utilise le proxy

## 3) Axios dans le projet

Axios est configure dans [vue/src/service/api.js](vue/src/service/api.js).

- `api` est une instance Axios prete pour PrestaShop.
- Auth Basic utilise la cle Webservice (username) et mot de passe vide.
- Les helpers `getXml/postXml/putXml/deleteXml` utilisent l instance `api`.

### Exemple Axios direct
```js
import { api } from '@/service/api';

const response = await api.get('/products');
console.log(response.data);
```

### Exemple avec XML helper
```js
import { getXml } from '@/service/api';

const data = await getXml('/products');
console.log(data);
```
