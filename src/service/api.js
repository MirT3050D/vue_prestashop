// Importation de la librairie axios pour les requêtes HTTP
import axios from 'axios';
// Importation du parseur XML de la librairie fast-xml-parser pour convertir le XML en JSON
import { XMLParser } from 'fast-xml-parser';
// Importation du constructeur XML de fast-xml-builder pour convertir le JSON en XML
import XMLBuilder from 'fast-xml-builder';

// Récupération de l'URL de base de l'API depuis les variables d'environnement
const urlBase = import.meta.env.VITE_API_URL;
// Récupération de la clé API depuis les variables d'environnement
const apiKey = import.meta.env.VITE_API_KEY;
// Création du header d'authentification basique avec la clé API encodée en base64
const basicAuthHeader = `Basic ${btoa(`${apiKey}:`)}`;

// Export de l'instance par défaut d'axios (api)
export const api = axios.create({
  // Utilise l'URL exacte qui fonctionne configurée dans l'environnement
  baseURL: urlBase,
  // Paramètres par défaut envoyés à chaque requête
  params: {
    // Clé d'API web service de PrestaShop
    ws_key: apiKey,
    // Format de sortie forcé en JSON
    output_format: 'JSON'
  }
});

// Instance axios "rawApi" (API brute), sans forcer le format de sortie
const rawApi = axios.create({
  // URL de base
  baseURL: urlBase,
  // Paramètre d'authentification ws_key uniquement
  params: {
    ws_key: apiKey
  }
});

// Instance axios "rawApiNoAuth" sans authentification, juste l'URL de base
const rawApiNoAuth = axios.create({
  baseURL: urlBase
});

// Instance axios "rawNoBaseAuth" sans URL de base mais avec authentification par ws_key
const rawNoBaseAuth = axios.create({
  params: {
    ws_key: apiKey
  }
});

// Instance axios complètement vierge sans URL ni Auth
const rawNoBaseNoAuth = axios.create();

// Instanciation et configuration du parseur XML
const xmlParser = new XMLParser({
  // On n'ignore pas les attributs XML
  ignoreAttributes: false,
  // Préfixe pour distinguer les attributs des éléments (ex: @_id)
  attributeNamePrefix: '@_'
});

// Instanciation et configuration du constructeur XML
const xmlBuilder = new XMLBuilder({
  // Prendre en compte les attributs
  ignoreAttributes: false,
  // Utiliser ce préfixe pour identifier les attributs
  attributeNamePrefix: '@_',
  // Formater joliment le XML de sortie
  format: true
});

// Fonction utilitaire pour vérifier si une chaîne de caractères ressemble à du XML
function isXmlString(value) {
  // Vérifie que c'est une chaîne, et qu'après nettoyage, le premier caractère est "<"
  return typeof value === 'string' && value.trim().startsWith('<');
}

// Fonction pour parser du XML de manière sécurisée sans planter l'application
function parseXmlSafe(xml) {
  try {
    // Essaie de parser la chaîne avec xmlParser
    return xmlParser.parse(xml);
  } catch (error) {
    // En cas d'erreur, retourne la chaîne originale
    return xml;
  }
}

// Fonction pour traiter les données retournées par l'API (parse le XML si c'en est)
function parseResponseData(data) {
  // Si c'est du XML, on le parse de façon sécurisée, sinon on retourne la donnée brute (JSON ou texte)
  return isXmlString(data) ? parseXmlSafe(data) : data;
}

// Fonction exportée pour parser explicitement une chaîne XML provenant de PrestaShop
export function parsePrestaXml(xmlString) {
  // Retourne l'objet JSON généré par xmlParser
  return xmlParser.parse(xmlString);
}

// Fonction exportée pour construire un XML à destination de PrestaShop
export function buildPrestaXml(payload) {
  // Si le payload est déjà une chaîne, on le retourne. Sinon on construit le XML avec xmlBuilder.
  return typeof payload === 'string' ? payload : xmlBuilder.build(payload);
}

// Fonction pour injecter les paramètres XML par défaut dans une configuration de requête
function withXmlDefaults(config = {}) {
  // Déstructuration de la configuration pour isoler les options spéciales et le reste (rest)
  const { skipXmlDefaults, skipAuth, skipBaseUrl, skipApiParams, ...rest } = config;

  // Retourne la configuration mise à jour
  return {
    ...rest,
    // Type de réponse attendu (texte par défaut)
    responseType: rest.responseType || 'text',
    // Fusion des paramètres de requête
    params: {
      // Si on ne doit pas sauter les valeurs par défaut du XML, on force l'output_format en XML
      ...(skipXmlDefaults ? {} : { output_format: 'XML' }),
      // Ajout des autres paramètres éventuels
      ...(rest.params || {})
    },
    // Fusion des headers (en-têtes HTTP)
    headers: {
      // Si on ne doit pas sauter les valeurs par défaut du XML, on signale qu'on accepte du XML
      ...(skipXmlDefaults ? {} : { Accept: 'application/xml' }),
      // Ajout des autres headers éventuels
      ...(rest.headers || {})
    }
  };
}

// Fonction pour obtenir la bonne instance Axios en fonction des options de la requête
function getClient(config = {}) {
  // Extraction des options pour choisir l'instance
  const { skipBaseUrl, skipAuth, skipApiParams } = config;

  // Si on ignore l'URL de base et l'authentification
  if (skipBaseUrl && skipAuth) return rawNoBaseNoAuth;
  // Si on ignore seulement l'URL de base
  if (skipBaseUrl) return rawNoBaseAuth;
  // Si on ignore l'authentification
  if (skipAuth) return rawApiNoAuth;
  // Si on ignore les paramètres API supplémentaires par défaut (output_format=JSON)
  if (skipApiParams) return rawApi;
  // Par défaut, retourne l'instance `api` standard
  return api;
}

// Fonction asynchrone exportée pour exécuter une requête GET et traiter le retour en tant que XML PrestaShop
export async function getXml(url, config) {
  // Récupère l'instance Axios adéquate
  const client = getClient(config);
  // Exécute la requête GET en injectant les paramètres XML par défaut
  const response = await client.get(url, withXmlDefaults(config));
  // Parse la donnée de la réponse (JSON ou XML converti)
  const parsed = parseResponseData(response.data);

  // Traitement spécifique pour formater correctement l'objet produits retourné par PrestaShop
  if (parsed && typeof parsed === 'object' && parsed.prestashop) {
    const p = parsed.prestashop;
    const productsNode = p.products;

    // Si le nœud products est vide ou nul, on le normalise en un objet avec un tableau vide
    if (productsNode === '' || productsNode === null) {
      p.products = { product: [] };
    }
    // S'il s'agit d'un objet (donc non vide et non null)
    else if (typeof productsNode === 'object') {
      // Si l'objet est vide -> aucun produit
      if (Object.keys(productsNode).length === 0) {
        p.products = { product: [] };
      }
      // S'il n'y a pas de propriété 'product' dans l'objet
      else if (!('product' in productsNode)) {
        // Si c'est directement un tableau de produits, on le wrap dans { product: [...] }
        if (Array.isArray(productsNode)) {
          p.products = { product: productsNode };
        }
      }
      else {
        // S'il n'y a qu'un seul produit (donc ce n'est pas un tableau), on le force à devenir un tableau
        if (productsNode.product && !Array.isArray(productsNode.product)) {
          productsNode.product = [productsNode.product];
        }
      }
    }
  }

  // Retourne l'objet final après nettoyage des nœuds problématiques
  return parsed;
}

// Fonction asynchrone exportée pour exécuter une requête POST avec un contenu XML
export const postXml = async (url, payload, config) => {
  // Convertit l'objet JS (payload) en XML
  const body = buildPrestaXml(payload);
  // Récupère le bon client Axios
  const client = getClient(config);
  // Exécute la requête POST avec l'URL, le corps XML et la configuration mise à jour
  const response = await client.post(url, body, {
    // Injection des paramètres par défaut
    ...withXmlDefaults(config),
    // Surcharge des headers pour spécifier qu'on envoie de l'XML
    headers: {
      'Content-Type': 'application/xml',
      ...(config?.headers || {})
    }
  });
  // Parse et retourne les données de la réponse
  return parseResponseData(response.data);
};

// Fonction asynchrone exportée pour exécuter une requête PUT (mise à jour) en XML
export async function putXml(url, payload, config) {
  // Convertit le payload en XML
  const body = buildPrestaXml(payload);
  // Récupère le bon client Axios
  const client = getClient(config);
  // Exécute la requête PUT
  const response = await client.put(url, body, {
    // Applique la configuration par défaut (XML)
    ...withXmlDefaults(config),
    // Surcharge des headers pour le Content-Type XML
    headers: {
      'Content-Type': 'application/xml',
      ...(config?.headers || {})
    }
  });
  // Parse et retourne la réponse
  return parseResponseData(response.data);
}

// Fonction asynchrone exportée pour exécuter une requête DELETE
export async function deleteXml(url, config) {
  // Récupère le client Axios adéquat
  const client = getClient(config);
  // Exécute la requête de suppression avec les paramètres par défaut
  const response = await client.delete(url, withXmlDefaults(config));
  // Parse et retourne les données renvoyées par l'API
  return parseResponseData(response.data);
}

// Fonction asynchrone exportée pour récupérer une image brute (blob)
export async function getImage(url) {
  // Log l'URL de l'image demandée (à des fins de débug)
  console.log("image", url);
  try {
    // Utilise l'API brute (sans 'output_format=JSON' qui casserait l'image)
    const response = await rawApi.get(url, {
      // Spécifie qu'on attend un objet binaire (blob)
      responseType: 'blob',
      // On accepte spécifiquement tous les types d'image
      headers: {
        Accept: 'image/*'
      }
    });
    // Crée une URL locale (blob URL) à partir de la réponse binaire
    return URL.createObjectURL(response.data);

  } catch (error) {
    // Si la récupération de l'image échoue, retourne null
    return null;
  }
}

// Fonction asynchrone exportée pour envoyer (POST) un fichier image
export async function postImage(url, imageFile) {
  // Instancie un objet FormData pour construire une requête de type "multipart/form-data"
  const formData = new FormData();
  // Ajoute l'image dans le champ 'image' du formulaire
  formData.append('image', imageFile);

  // Exécute la requête POST avec l'instance axios `api` (JSON)
  const response = await api.post(url, formData, {
    // Définition des headers nécessaires pour l'envoi de fichiers
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    // On attend du texte en réponse
    responseType: 'text'
  });
  // Parse la réponse et la retourne
  return parseResponseData(response.data);
}

// Fonction asynchrone exportée pour récupérer une configuration spécifique de PrestaShop
export async function getPrestaShopConfig(name) {
  // Effectue un appel GET XML en filtrant par le nom de la configuration
  const response = await getXml(`/configurations?display=full&filter[name]=[${name}]`);
  // Extrait la donnée utile du chemin de l'objet XML converti
  const config = response?.prestashop?.configurations?.configuration;
  // Si config est un tableau, retourne le premier élément, sinon retourne la config telle quelle
  return Array.isArray(config) ? config[0] : config;
}

// Fonction exportée pour formater un objet d'erreur Axios / API afin d'afficher un message plus compréhensible
export function formatApiError(error) {
  // S'il n'y a pas d'erreur, retourne un message par défaut
  if (!error) return 'Erreur inconnue';

  // Récupère le message d'erreur standard
  let msg = error.message || String(error);

  // Si on a des informations sur la requête Axios (error.config)
  if (error.config) {
    // Extraction de la méthode HTTP
    const method = error.config.method ? error.config.method.toUpperCase() : '';
    // Extraction de l'URL
    let url = error.config.url || '';
    // Sécurité : masquer la clé API (ws_key) dans l'URL pour éviter les fuites
    url = url.replace(/ws_key=[^&]*/gi, 'ws_key=***');
    // Ajoute la méthode et l'URL au message d'erreur
    msg += ` [API ${method} ${url}]`;

    // S'il y a des paramètres query dans la config, on les formate aussi
    if (error.config.params && Object.keys(error.config.params).length > 0) {
      // Copie pour ne pas muter l'original
      const safeParams = { ...error.config.params };
      // Masquer la clé API
      if (safeParams.ws_key) {
        safeParams.ws_key = '***';
      }
      // Ajoute les paramètres formatés au message
      msg += ` params: ${JSON.stringify(safeParams)}`;
    }

    // S'il y a des données de payload envoyées
    if (error.config.data) {
      // Transformation des données en chaîne pour l'affichage
      const payloadStr = typeof error.config.data === 'object' ? JSON.stringify(error.config.data) : String(error.config.data);
      // Nettoyage des retours à la ligne et espaces en trop
      const cleanPayload = payloadStr.replace(/\s+/g, ' ').trim();
      // Ajoute une portion du payload au message (limite 300 char)
      msg += ` | Payload : ${cleanPayload.substring(0, 300)}${cleanPayload.length > 300 ? '...' : ''}`;
    }
  }

  // Si on a reçu une réponse (statut HTTP renvoyé par le serveur)
  if (error.response) {
    // Ajoute le code HTTP
    msg += ` | Statut : ${error.response.status}`;
    // Si la réponse contient des données d'erreur
    if (error.response.data) {
      const data = error.response.data;
      const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data);

      // Si le message d'erreur ressemble à du XML PrestaShop (présence des balises <error> ou <message>)
      if (dataStr.includes('<error>') || dataStr.includes('<message>')) {
        // Recherche des balises message contenant du CDATA
        const matches = [...dataStr.matchAll(/<message[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/message>/gi)];
        if (matches.length > 0) {
          // Concatène toutes les erreurs trouvées
          const apiMsgs = matches.map(m => m[1].trim()).join(', ');
          msg += ` | Détail API : ${apiMsgs}`;
        } else {
          // Si pas de CDATA, recherche simple des contenus des balises <message>
          const matchesNoCdata = [...dataStr.matchAll(/<message[^>]*>([\s\S]*?)<\/message>/gi)];
          if (matchesNoCdata.length > 0) {
            const apiMsgs = matchesNoCdata.map(m => m[1].trim()).join(', ');
            msg += ` | Détail API : ${apiMsgs}`;
          } else {
            // Si toujours rien, on rajoute un bout du XML complet
            msg += ` | XML : ${dataStr.replace(/\s+/g, ' ').substring(0, 300)}`;
          }
        }
      }
      // Si la réponse est une page HTML (typique des erreurs serveurs comme PHP / Apache)
      else if (dataStr.includes('<!DOCTYPE') || dataStr.includes('<html')) {
        // Tente d'extraire le titre de la page pour le log
        const titleMatch = dataStr.match(/<title>([\s\S]*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '';

        let phpError = '';
        // Recherche des erreurs typiques de PHP (Fatal error, Parse error, Warning)
        if (dataStr.includes('Fatal error') || dataStr.includes('Parse error') || dataStr.includes('Warning:')) {
          // Retire les balises HTML
          const bodyText = dataStr.replace(/<[^>]*>/g, ' ');
          // Recherche l'erreur via une Regex
          const phpMatch = bodyText.match(/(?:Fatal error|Parse error|Warning|Notice):[^.]*/i);
          if (phpMatch) {
            phpError = phpMatch[0].trim().replace(/\s+/g, ' ');
          }
        }

        // Si on a un titre ou une erreur PHP extraite
        if (title || phpError) {
          msg += ` | Page HTML (${title || 'Sans titre'}) ${phpError ? `| PHP : ${phpError}` : ''}`;
        } else {
          // Sinon on dump un bout du code HTML
          const stripped = dataStr.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          msg += ` | HTML : ${stripped.substring(0, 200)}...`;
        }
      }
      else {
        // En cas d'autre format inconnu, on récupère un bout du message texte
        msg += ` | Détail : ${dataStr.replace(/\s+/g, ' ').substring(0, 300)}`;
      }
    }
  }

  // Retourne le message d'erreur complet et bien formaté
  return msg;
}
