# Guide : Utiliser `postXml` avec l'API PrestaShop

## Table des matières

1. [Comment découvrir la structure XML attendue](#1-comment-découvrir-la-structure-xml-attendue)
2. [Comprendre la fonction `postXml`](#2-comprendre-la-fonction-postxml)
3. [Deux façons de passer le payload](#3-deux-façons-de-passer-le-payload)
4. [Exemple complet : Créer un Cart](#4-exemple-complet--créer-un-cart)
5. [Autres exemples courants](#5-autres-exemples-courants)
6. [Résumé du workflow](#6-résumé-du-workflow)

---

## 1. Comment découvrir la structure XML attendue

PrestaShop fournit un mécanisme intégré pour connaître **tous les champs** d'une ressource. Il suffit d'ajouter le paramètre `schema` à l'URL de la ressource.

### `schema=blank` — Template vide

Retourne un XML vide avec **tous les champs disponibles** pour la ressource, prêts à être remplis.

```
GET /api/carts?schema=blank
```

Exemple de réponse :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id></id>
    <id_address_delivery></id_address_delivery>
    <id_address_invoice></id_address_invoice>
    <id_currency></id_currency>
    <id_customer></id_customer>
    <id_guest></id_guest>
    <id_lang></id_lang>
    <id_shop_group></id_shop_group>
    <id_shop></id_shop>
    <id_carrier></id_carrier>
    <recyclable></recyclable>
    <gift></gift>
    <gift_message></gift_message>
    <mobile_theme></mobile_theme>
    <delivery_option></delivery_option>
    <secure_key></secure_key>
    <allow_separated_package></allow_separated_package>
    <date_add></date_add>
    <date_upd></date_upd>
    <associations>
      <cart_rows>
        <cart_row>
          <id_product></id_product>
          <id_product_attribute></id_product_attribute>
          <id_address_delivery></id_address_delivery>
          <id_customization></id_customization>
          <quantity></quantity>
        </cart_row>
      </cart_rows>
    </associations>
  </cart>
</prestashop>
```

### `schema=synopsis` — Template avec métadonnées

Retourne la même structure mais avec des **informations supplémentaires** sur chaque champ : si le champ est requis, son type, sa taille maximale, etc.

```
GET /api/carts?schema=synopsis
```

Les attributs ajoutés sont :

| Attribut      | Description                                      |
|---------------|--------------------------------------------------|
| `required`    | `true` si le champ est obligatoire               |
| `maxSize`     | Taille maximale du champ                          |
| `format`      | Type attendu (`isUnsignedId`, `isBool`, etc.)     |
| `readOnly`    | `true` si le champ est en lecture seule (ex: `id`) |

### Exemple réel : Synopsis du Cart

Voici la réponse réelle de `GET /api/carts?schema=synopsis` :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<prestashop xmlns:xlink="http://www.w3.org/1999/xlink">
    <cart>
        <id_address_delivery format="isUnsignedId"><![CDATA[]]></id_address_delivery>
        <id_address_invoice format="isUnsignedId"><![CDATA[]]></id_address_invoice>
        <id_currency required="true" format="isUnsignedId"><![CDATA[]]></id_currency>
        <id_customer format="isUnsignedId"><![CDATA[]]></id_customer>
        <id_guest format="isUnsignedId"><![CDATA[]]></id_guest>
        <id_lang required="true" format="isUnsignedId"><![CDATA[]]></id_lang>
        <id_shop_group format="isUnsignedId"><![CDATA[]]></id_shop_group>
        <id_shop format="isUnsignedId"><![CDATA[]]></id_shop>
        <id_carrier format="isUnsignedId"><![CDATA[]]></id_carrier>
        <recyclable format="isBool"><![CDATA[]]></recyclable>
        <gift format="isBool"><![CDATA[]]></gift>
        <gift_message maxSize="4194303" format="isCleanHtml"><![CDATA[]]></gift_message>
        <mobile_theme format="isBool"><![CDATA[]]></mobile_theme>
        <delivery_option maxSize="4194303"><![CDATA[]]></delivery_option>
        <secure_key maxSize="32"><![CDATA[]]></secure_key>
        <allow_seperated_package format="isBool"><![CDATA[]]></allow_seperated_package>
        <date_add format="isDate"><![CDATA[]]></date_add>
        <date_upd format="isDate"><![CDATA[]]></date_upd>
        <associations>
            <cart_rows nodeType="cart_row" virtualEntity="true">
                <cart_row>
                    <id_product required="true"><![CDATA[]]></id_product>
                    <id_product_attribute required="true"><![CDATA[]]></id_product_attribute>
                    <id_address_delivery required="true"><![CDATA[]]></id_address_delivery>
                    <id_customization><![CDATA[]]></id_customization>
                    <quantity required="true"><![CDATA[]]></quantity>
                </cart_row>
            </cart_rows>
        </associations>
    </cart>
</prestashop>
```

### Comment lire ce synopsis et construire le POST

#### Étape 1 : Identifier les champs `required="true"`

Dans le synopsis ci-dessus, les champs obligatoires sont :

**Au niveau `<cart>` :**

| Champ          | Format          | Obligatoire | Exemple |
|----------------|-----------------|:-----------:|---------|
| `id_currency`  | `isUnsignedId`  | ✅ oui      | `1`     |
| `id_lang`      | `isUnsignedId`  | ✅ oui      | `1`     |
| `id_customer`  | `isUnsignedId`  | ❌ non      | `1`     |
| `id_carrier`   | `isUnsignedId`  | ❌ non      | `2`     |
| `gift`         | `isBool`        | ❌ non      | `0`     |
| ...            | ...             | ❌ non      | ...     |

**Au niveau de chaque `<cart_row>` (dans `<associations>`) :**

| Champ                  | Obligatoire | Exemple |
|------------------------|:-----------:|---------|
| `id_product`           | ✅ oui      | `5`     |
| `id_product_attribute` | ✅ oui      | `0` (si pas de variante) |
| `id_address_delivery`  | ✅ oui      | `1`     |
| `quantity`             | ✅ oui      | `2`     |
| `id_customization`     | ❌ non      | —       |

#### Étape 2 : Nettoyer le XML

On enlève tout ce qui est métadonnée :

- ❌ `xmlns:xlink="..."` → supprimer
- ❌ `format="..."` → supprimer
- ❌ `required="true"` → supprimer
- ❌ `xlink:href="..."` → supprimer
- ❌ `nodeType="..."`, `virtualEntity="..."` → supprimer
- ❌ `<![CDATA[]]>` → remplacer par la **vraie valeur**
- ❌ Les champs optionnels non utilisés → supprimer entièrement

#### Étape 3 : Résultat final — le XML à envoyer

```xml
<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>1</id_customer>
    <associations>
      <cart_rows>
        <cart_row>
          <id_product>5</id_product>
          <id_product_attribute>0</id_product_attribute>
          <id_address_delivery>1</id_address_delivery>
          <quantity>2</quantity>
        </cart_row>
      </cart_rows>
    </associations>
  </cart>
</prestashop>
```

#### Visualisation de la transformation

```
SYNOPSIS (ce que tu reçois)                    POST (ce que tu envoies)
───────────────────────────────────            ───────────────────────────
<id_currency required="true"            →     <id_currency>1</id_currency>
  format="isUnsignedId">
  <![CDATA[]]>
</id_currency>

<gift format="isBool">                  →     (optionnel, on le supprime)
  <![CDATA[]]>
</gift>

<id_product required="true"            →     <id_product>5</id_product>
  xlink:href="http://...">
  <![CDATA[]]>
</id_product>
```

### Comment faire cet appel dans le code

```javascript
import { getXml } from '@/service/api'

// Récupérer le schema blank d'une ressource
const schema = await getXml('/api/carts', {
  params: { schema: 'blank' }
})
console.log(schema)

// Récupérer le schema synopsis (avec les types et required)
const synopsis = await getXml('/api/carts', {
  params: { schema: 'synopsis' }
})
console.log(synopsis)
```

> **Astuce** : Tu peux aussi tester directement dans le navigateur :  
> `http://127.0.0.1:8000/api/carts?schema=blank&output_format=XML`  
> (avec l'authentification Basic en ajoutant la clé API comme username)

---

## 2. Comprendre la fonction `postXml`

La fonction `postXml` se trouve dans `src/service/api.js`. Voici ce qu'elle fait étape par étape :

```javascript
export async function postXml(url, payload, config) {
  // 1. Convertit le payload en XML si c'est un objet JS
  //    Si c'est déjà un string XML, il le garde tel quel
  const body = buildPrestaXml(payload);

  // 2. Envoie la requête POST avec les bons headers
  const response = await api.post(url, body, {
    ...withXmlDefaults(config),        // output_format: XML, Accept: application/xml
    headers: {
      'Content-Type': 'application/xml', // Indique que le body est du XML
      ...(config?.headers || {})
    }
  });

  // 3. Parse la réponse XML en objet JS et la retourne
  return parseResponseData(response.data);
}
```

### Signature

```javascript
postXml(url, payload, config?)
```

| Paramètre  | Type               | Description                                          |
|------------|--------------------|------------------------------------------------------|
| `url`      | `string`           | L'endpoint API (ex: `/api/carts`)                    |
| `payload`  | `string` ou `object` | Le body XML (string brut) ou un objet JS à convertir |
| `config`   | `object` (optionnel)| Config Axios supplémentaire (params, headers, etc.)  |

### Retour

Un **objet JavaScript** contenant la réponse parsée de PrestaShop (la ressource créée avec son `id` généré).

---

## 3. Deux façons de passer le payload

### Méthode A : String XML brut

Tu écris directement le XML en tant que string. C'est plus lisible et tu contrôles exactement ce qui est envoyé.

```javascript
const xmlString = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>1</id_customer>
  </cart>
</prestashop>`

const result = await postXml('/api/carts', xmlString)
```

### Méthode B : Objet JavaScript

Tu passes un objet JS qui sera **automatiquement converti** en XML par `XMLBuilder` (via `buildPrestaXml`).

```javascript
const payload = {
  prestashop: {
    cart: {
      id_currency: 1,
      id_lang: 1,
      id_customer: 1
    }
  }
}

const result = await postXml('/api/carts', payload)
```

### Quelle méthode choisir ?

| Critère                           | String XML | Objet JS |
|-----------------------------------|:----------:|:--------:|
| Contrôle total du XML             | ✅          | ❌        |
| Données dynamiques faciles        | ❌          | ✅        |
| Lisibilité                        | ✅          | ✅        |
| Gestion des `associations` (listes) | ✅        | ⚠️ Attention aux tableaux |

> **⚠️ Attention avec les objets JS et les listes** : Si tu as plusieurs `cart_row`, 
> tu dois passer un **tableau**. `XMLBuilder` gère ça, mais vérifier la sortie est recommandé.

---

## 4. Exemple complet : Créer un Cart

### Étape 1 : Découvrir les champs

```javascript
import { getXml } from '@/service/api'

const schema = await getXml('/api/carts', {
  params: { schema: 'blank' }
})
console.log('Champs disponibles :', schema)
```

### Étape 2 : Construire et envoyer le payload

```javascript
import { postXml } from '@/service/api'

// Créer un panier avec un produit
async function createCart(customerId, productId, quantity = 1, productAttributeId = 0) {
  const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <cart>
    <id_currency>1</id_currency>
    <id_lang>1</id_lang>
    <id_customer>${customerId}</id_customer>
    <id_address_delivery>1</id_address_delivery>
    <id_address_invoice>1</id_address_invoice>
    <associations>
      <cart_rows>
        <cart_row>
          <id_product>${productId}</id_product>
          <id_product_attribute>${productAttributeId}</id_product_attribute>
          <quantity>${quantity}</quantity>
        </cart_row>
      </cart_rows>
    </associations>
  </cart>
</prestashop>`

  try {
    const result = await postXml('/api/carts', payload)
    console.log('Cart créé :', result)
    return result
  } catch (error) {
    console.error('Erreur création cart :', error.response?.data || error.message)
    throw error
  }
}

// Utilisation
const newCart = await createCart(1, 5, 2)  // Client 1, Produit 5, Quantité 2
```

### Étape 3 : Lire la réponse

La réponse sera un objet JS (parsé depuis XML) contenant le cart créé avec son `id` :

```javascript
{
  prestashop: {
    cart: {
      id: 42,
      id_currency: 1,
      id_lang: 1,
      id_customer: 1,
      // ... autres champs remplis par PrestaShop
    }
  }
}
```

---

## 5. Autres exemples courants

### Créer une adresse

```javascript
const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <address>
    <id_customer>1</id_customer>
    <id_country>8</id_country>
    <alias>Mon adresse</alias>
    <lastname>Doe</lastname>
    <firstname>John</firstname>
    <address1>1 rue Exemple</address1>
    <postcode>75000</postcode>
    <city>Paris</city>
  </address>
</prestashop>`

const result = await postXml('/api/addresses', payload)
```

### Créer un produit

```javascript
const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <product>
    <name><language id="1">Nouveau produit</language></name>
    <link_rewrite><language id="1">nouveau-produit</language></link_rewrite>
    <id_category_default>2</id_category_default>
    <price>9.99</price>
    <active>1</active>
  </product>
</prestashop>`

const result = await postXml('/api/products', payload)
```

### Créer un client

```javascript
const payload = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <customer>
    <firstname>John</firstname>
    <lastname>Doe</lastname>
    <email>john.doe@example.com</email>
    <passwd>password123</passwd>
    <id_default_group>3</id_default_group>
    <active>1</active>
  </customer>
</prestashop>`

const result = await postXml('/api/customers', payload)
```

---

## 6. Résumé du workflow

```
┌─────────────────────────────────────────────────┐
│  1. DÉCOUVRIR la structure                      │
│     GET /api/{ressource}?schema=blank           │
│     → te donne tous les champs possibles        │
├─────────────────────────────────────────────────┤
│  2. IDENTIFIER les champs obligatoires          │
│     GET /api/{ressource}?schema=synopsis        │
│     → te dit quels champs sont required         │
├─────────────────────────────────────────────────┤
│  3. CONSTRUIRE ton payload                      │
│     - String XML ou objet JS                    │
│     - Toujours wrapper dans <prestashop>        │
│     - Ne remplir que les champs nécessaires     │
├─────────────────────────────────────────────────┤
│  4. ENVOYER avec postXml                        │
│     postXml('/api/{ressource}', payload)         │
│     → retourne la ressource créée avec son id   │
└─────────────────────────────────────────────────┘
```

### Règles importantes

1. **Toujours wrapper dans `<prestashop>`** : le XML doit commencer par `<prestashop>` puis le nom de la ressource au singulier (`<cart>`, `<address>`, `<product>`, etc.)

2. **Ne pas inclure `<id>`** dans un POST : l'id est généré automatiquement par PrestaShop.

3. **Champs multilingues** : certains champs (comme `name`, `description`) nécessitent une balise `<language>` avec l'attribut `id` :
   ```xml
   <name><language id="1">Mon produit</language></name>
   ```

4. **Associations** : pour les relations (produits dans un cart, catégories d'un produit), utiliser la section `<associations>`.

5. **Gestion des erreurs** : PrestaShop retourne un XML d'erreur descriptif si un champ obligatoire manque ou si une valeur est invalide. Toujours vérifier `error.response?.data`.
