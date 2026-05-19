# Service : API Core (`api.js`)

Ce service centralise et standardise toutes les requêtes réseau vers le Webservice REST de PrestaShop. Il prend en charge l'injection automatique de la clé API, la gestion du proxy CORS de développement et la sérialisation bidirectionnelle JSON ↔ XML.

---

## ⚙️ Rôle et Fonctionnement

1.  **Client Axios** : Crée un client Axios configuré pour pointer vers `/api_ps` (proxy Vite).
2.  **Clé API PrestaShop (`ws_key`)** : Injecte systématiquement la clé d'authentification issue du fichier `.env` dans les paramètres d'URL de chaque requête.
3.  **Parsing XML automatique** :
    *   Toutes les réponses reçues du Webservice (XML brut) sont décodées en objets JavaScript natifs à l'aide de la bibliothèque `fast-xml-parser`.
    *   Les payloads JavaScript passés aux requêtes de type `POST` ou `PUT` sont convertis en chaînes XML conformes aux schémas de PrestaShop via un outil de reconstruction XML.

---

## 🛠️ Code Principal

Voici l'implémentation de la couche réseau dans `src/service/api.js` :

```javascript
import axios from 'axios';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';

// Initialisation du parseur XML (avec prise en charge des attributs ex: @_id)
const parser = new XMLParser({ ignoreAttributes: false });
const builder = new XMLBuilder({ ignoreAttributes: false });

const apiClient = axios.create({
    baseURL: import.meta.env.VITE_API_URL, // ex: '/api_ps'
    params: {
        ws_key: import.meta.env.VITE_API_KEY // Clé API Webservice
    }
});

// Appel GET : retourne le XML converti en JSON
export async function getXml(url) {
    const response = await apiClient.get(url, {
        headers: { 'Content-Type': 'application/xml' }
    });
    return parser.parse(response.data);
}

// Appel POST : convertit le JSON en XML avant l'envoi
export async function postXml(url, jsonData) {
    let xmlPayload = '';
    if (typeof jsonData === 'string') {
        xmlPayload = jsonData;
    } else {
        xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>\n` + builder.build(jsonData);
    }

    const response = await apiClient.post(url, xmlPayload, {
        headers: { 'Content-Type': 'application/xml' }
    });
    return parser.parse(response.data);
}

// Appel PUT : met à jour une ressource existante via XML
export async function putXml(url, jsonData) {
    let xmlPayload = '';
    if (typeof jsonData === 'string') {
        xmlPayload = jsonData;
    } else {
        xmlPayload = `<?xml version="1.0" encoding="UTF-8"?>\n` + builder.build(jsonData);
    }

    const response = await apiClient.put(url, xmlPayload, {
        headers: { 'Content-Type': 'application/xml' }
    });
    return parser.parse(response.data);
}
```
