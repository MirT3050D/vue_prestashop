// Importation des utilitaires d'API
import { deleteXml, getXml } from '@/service/api';

/**
 * Extrait un tableau d'éléments depuis la réponse de l'API.
 * Gère les cas où PrestaShop renvoie un objet unique au lieu d'un tableau.
 */
export function getCollectionItems(payload, target) {
  if (!payload || !payload.prestashop || !payload.prestashop[target.collectionKey]) {
    return [];
  }

  const collection = payload.prestashop[target.collectionKey][target.itemKey];

  if (Array.isArray(collection)) {
    return collection;
  }

  if (collection) {
    return [collection];
  }

  return [];
}

/**
 * Extrait de manière sécurisée l'identifiant (ID) d'un élément XML.
 * Gère les différentes structures XML renvoyées par fast-xml-parser.
 */
export function extractItemId(item) {
  if (!item) {
    return null;
  }

  if (item['@_id']) {
    return item['@_id'];
  }

  if (item.id) {
    return item.id;
  }

  if (item['@id']) {
    return item['@id'];
  }

  return null;
}

/**
 * Récupère tous les IDs d'une ressource spécifique (ex: tous les IDs de produits).
 * Fonctionne avec un système de pagination (limit) pour éviter de crasher le serveur
 * si la base de données contient des milliers d'entrées.
 */
export async function fetchIdsForTarget(target) {
  const pageSize = 100; // Nombre d'éléments par requête
  const uniqueIds = new Set(); // Set pour éviter les doublons accidentels
  let offset = 0;

  while (true) {
    // Requête paginée, on ne demande que le champ [id] pour minimiser le poids réseau
    const payload = await getXml(`${target.endpoint}?display=[id]&limit=${offset},${pageSize}`);
    const items = getCollectionItems(payload, target);

    if (!items.length) {
      break; // Fin de la boucle si plus d'éléments retournés
    }

    items.forEach((item) => {
      const itemId = extractItemId(item);
      // On exclut les IDs protégés (ex: Le client par défaut de PrestaShop)
      if (itemId != null && !target.skipIds.includes(Number(itemId))) {
        uniqueIds.add(String(itemId));
      }
    });

    if (items.length < pageSize) {
      break; // Si on a reçu moins d'éléments que la taille de la page, c'est la dernière page
    }

    offset += pageSize;
  }

  return [...uniqueIds];
}

/**
 * Vide intégralement une ressource (ex: Supprime toutes les catégories).
 * Utilisé pour le Rollback en cas d'erreur d'importation.
 */
export async function resetTarget(target, logCallback = () => {}) {
  // 1. Récupère la liste de tous les IDs à supprimer
  const ids = await fetchIdsForTarget(target);

  if (!ids.length) {
    logCallback('success', `${target.label}: aucune ligne a supprimer.`);
    return;
  }

  logCallback('info', `${target.label}: ${ids.length} element(s) a supprimer.`);

  // 2. Supprime chaque élément un par un via des requêtes DELETE
  for (const id of ids) {
    try {
      await deleteXml(`${target.endpoint}/${id}`);
      logCallback('success', `${target.label}: suppression de l'identifiant ${id}.`);
    } catch (e) {
      // Si l'élément n'existe déjà plus, on ignore l'erreur
      if (e.response && e.response.status === 404) {
        logCallback('info', `${target.label}: l'identifiant ${id} est deja supprime.`);
      } else {
        logCallback('error', `${target.label}: Erreur lors de la suppression de l'identifiant ${id} (${e.message}).`);
      }
    }
  }
}

/**
 * Orchestrateur principal du Rollback.
 * Prend un tableau de cibles (ex: Produits, Déclinaisons, Images) et les vide séquentiellement.
 */
export async function runResetForTargets(targets, logCallback = () => {}) {
  for (const target of targets) {
    try {
      await resetTarget(target, logCallback);
    } catch (error) {
      logCallback('error', `${target.label}: ${error?.message ?? 'erreur inconnue'}.`);
    }
  }
}
