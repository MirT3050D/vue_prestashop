// Importation des méthodes d'appel API de base depuis le service centralisé
import { getXml, postXml, putXml, deleteXml } from '@/service/api';
// Importation des utilitaires spécifiques à PrestaShop (gestion des langues et extraction sécurisée des IDs)
import { getLangText, extractId as safeId } from '@/service/prestashopUtils';
// Importation de la fonction permettant de récupérer le taux de taxe applicable à un produit
import { getProductTaxRate } from '@/service/price';

/**
 * Normalise les nœuds de ressources PrestaShop pour toujours retourner un tableau.
 * PrestaShop a tendance à renvoyer un objet unique s'il y a 1 résultat, ou rien si 0.
 * Cette fonction uniformise tout sous forme de tableau.
 * 
 * @param {Object} node Le nœud de la ressource (ex: response.prestashop.products)
 * @param {string} singularKey La clé singulière de l'objet (ex: 'product')
 */
function normalizeArray(node, singularKey) {
    // Si le nœud parent n'existe pas ou est vide, on renvoie un tableau vide
    if (!node || node === '') return [];
    // Extrait l'élément ou la liste cible
    const list = node[singularKey];
    // Si l'élément cible n'existe pas, on renvoie un tableau vide
    if (!list) return [];
    // Si c'est déjà un tableau on le renvoie, sinon on le met dans un tableau
    return Array.isArray(list) ? list : [list];
}

/**
 * Récupère la liste des produits depuis l'API PrestaShop.
 * 
 * @param {string|Object} params Les paramètres de la requête (par défaut 'display=full' pour tout récupérer)
 */
export async function getProducts(params = 'display=full') {
    // Convertit les paramètres en chaîne de caractères pour l'URL si c'est un objet, sinon garde la chaîne
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    // Exécute la requête GET sur le point d'entrée /products avec la requête formatée
    const response = await getXml(`/products${query ? '?' + query : ''}`);
    // Normalise le résultat pour s'assurer qu'on renvoie toujours un tableau d'objets 'product'
    return normalizeArray(response?.prestashop?.products, 'product');
}

/**
 * Récupère un seul produit spécifique via son ID.
 * 
 * @param {number|string} id L'identifiant unique du produit
 * @param {string|Object} params Les paramètres optionnels
 */
export async function getProduct(id, params = '') {
    // Formate les paramètres
    const query = typeof params === 'object' ? new URLSearchParams(params).toString() : params;
    // Exécute la requête GET pour ce produit spécifique
    const response = await getXml(`/products/${id}${query ? '?' + query : ''}`);
    // Renvoie l'objet produit directement, ou null s'il n'y a pas de réponse valide
    return response?.prestashop?.product || null;
}

/**
 * Crée un nouveau produit sur PrestaShop.
 * 
 * @param {string|Object} payload Les données du produit à insérer (format attendu par l'API)
 */
export async function createProduct(payload) {
    // Exécute la requête POST pour la création
    return await postXml('/products', payload);
}

/**
 * Met à jour un produit existant.
 * 
 * @param {number|string} id L'identifiant du produit à modifier
 * @param {string|Object} payload Les nouvelles données du produit
 */
export async function updateProduct(id, payload) {
    // Exécute la requête PUT sur la route du produit spécifique
    return await putXml(`/products/${id}`, payload);
}

/**
 * Supprime un produit.
 * 
 * @param {number|string} id L'identifiant du produit à supprimer
 */
export async function deleteProduct(id) {
    // Exécute la requête DELETE sur la route du produit spécifique
    return await deleteXml(`/products/${id}`);
}

/**
 * Récupère les combinaisons (déclinaisons comme Taille/Couleur) pour un produit spécifique.
 * 
 * @param {number|string} productId L'identifiant du produit parent
 */
export async function getCombinations(productId) {
    // Lance une requête filtrée sur les combinaisons appartenant à ce produit précis
    const response = await getXml(`/combinations?display=full&filter[id_product]=[${productId}]`);
    // Retourne un tableau normalisé de combinaisons
    return normalizeArray(response?.prestashop?.combinations, 'combination');
}

/**
 * Récupère les valeurs d'options de produit spécifiques via une liste d'IDs séparés par des pipes (|).
 * (ex: id=1|2|3)
 * 
 * @param {string} ids Les identifiants des valeurs d'options (ex: la valeur "Rouge" de l'option "Couleur")
 */
export async function getProductOptionValues(ids) {
    // Lance une requête filtrée pour obtenir les détails de ces valeurs spécifiques
    const response = await getXml(`/product_option_values?display=full&filter[id]=[${ids}]`);
    // Retourne le tableau des valeurs d'options
    return normalizeArray(response?.prestashop?.product_option_values, 'product_option_value');
}

/**
 * Récupère les options de produit (les groupes d'attributs) via une liste d'IDs séparés par des pipes.
 * (ex: id=1|2 pour "Couleur" et "Taille")
 * 
 * @param {string} ids Les identifiants des groupes d'options
 */
export async function getProductOptions(ids) {
    // Lance une requête filtrée pour obtenir les détails des groupes
    const response = await getXml(`/product_options?display=full&filter[id]=[${ids}]`);
    // Retourne le tableau des groupes d'options
    return normalizeArray(response?.prestashop?.product_options, 'product_option');
}

/**
 * Charge tous les détails complexes d'un produit (Informations de base, TVA, combinaisons et valeurs d'attributs formatées).
 * C'est la fonction métier principale pour la page de détail produit.
 * 
 * @param {number|string} productId L'ID du produit
 */
export async function getFullProductDetails(productId) {
    // 1. Récupère les données de base du produit
    const product = await getProduct(productId);
    // Si le produit n'existe pas, on arrête tout
    if (!product) return null;

    // 2. Récupère le taux de taxe (TVA) applicable au produit
    const taxRate = await getProductTaxRate(productId);
    
    // 3. Récupère toutes les déclinaisons (combinaisons) du produit
    const allCombinations = await getCombinations(productId);
    
    // Initialisation des tableaux qui vont contenir les données formatées pour l'UI
    let structuredVariants = [];
    let defaultSelectedOptions = {};

    // S'il y a des déclinaisons pour ce produit
    if (allCombinations.length > 0) {
        // Un Set pour stocker les IDs uniques des valeurs d'options utilisées par toutes les combinaisons
        const optionValuesIds = new Set();
        
        // Boucle sur chaque combinaison pour extraire ses IDs de valeur d'option
        for (let i = 0; i < allCombinations.length; i++) {
            let combValues = allCombinations[i].associations?.product_option_values?.product_option_value;
            // Si pas de valeurs pour cette combinaison, on passe à la suivante
            if (!combValues) continue;
            
            // Si c'est un tableau de valeurs (ex: Taille M + Couleur Rouge)
            if (Array.isArray(combValues)) {
                // On ajoute chaque ID sécurisé dans le Set
                for (let j = 0; j < combValues.length; j++) optionValuesIds.add(safeId(combValues[j].id));
            } else {
                // Si c'est une seule valeur (ex: Taille Unique)
                optionValuesIds.add(safeId(combValues.id));
            }
        }

        // Si des valeurs d'options ont été trouvées
        if (optionValuesIds.size > 0) {
            // Construit la chaîne de filtrage PrestaShop (ex: [1|2|5|8])
            const filterIds = `[${Array.from(optionValuesIds).join('|')}]`;
            // Appelle l'API pour récupérer le détail de ces valeurs d'options
            const rawValues = await getProductOptionValues(filterIds);
            // S'assure que le résultat est un tableau
            const values = Array.isArray(rawValues) ? rawValues : (rawValues ? [rawValues] : []);

            // Set pour extraire les IDs de groupe (ex: ID du groupe "Couleur", ID du groupe "Taille")
            const optionGroupsIds = new Set();
            for (let i = 0; i < values.length; i++) {
                if (values[i]) {
                    // Ajoute l'ID du groupe rattaché à la valeur
                    optionGroupsIds.add(safeId(values[i].id_attribute_group));
                }
            }

            // Construit la chaîne de filtrage pour les groupes (ex: [1|2])
            const filterGroupIds = `[${Array.from(optionGroupsIds).join('|')}]`;
            // Appelle l'API pour récupérer les noms et détails des groupes d'options
            const rawGroups = await getProductOptions(filterGroupIds);
            // S'assure que c'est un tableau
            const groups = Array.isArray(rawGroups) ? rawGroups : (rawGroups ? [rawGroups] : []);

            // Boucle pour structurer les variantes de manière logique (Groupe -> Valeurs)
            for (let i = 0; i < groups.length; i++) {
                let group = groups[i];
                if (!group) continue;

                // Filtre les valeurs d'options pour ne garder que celles appartenant à ce groupe précis
                let groupValues = values.filter(v => v && safeId(v.id_attribute_group) === safeId(group.id));
                // Construit l'objet variante final pour l'interface utilisateur
                structuredVariants.push({
                    id: safeId(group.id), // ID du groupe
                    name: getLangText(group.name), // Nom du groupe (ex: "Taille") gérant le multilingue
                    // Mappe les valeurs de ce groupe (ex: "S", "M", "L")
                    values: groupValues.map(v => ({ id: safeId(v.id), name: getLangText(v.name) }))
                });
            }

            // 4. Initialisation intelligente : pré-sélection de la première combinaison valide
            if (allCombinations.length > 0) {
                // Prend la toute première combinaison du tableau comme choix par défaut
                const firstComb = allCombinations[0];
                const combValues = firstComb.associations?.product_option_values?.product_option_value;
                // Extrait les IDs des valeurs de cette première combinaison
                const firstCombValueIds = Array.isArray(combValues)
                    ? combValues.map(v => safeId(v.id))
                    : [safeId(combValues.id)];

                // Boucle sur les variantes structurées (Taille, Couleur...)
                for (let i = 0; i < structuredVariants.length; i++) {
                    let v = structuredVariants[i];
                    if (v && v.values && v.values.length > 0) {
                        // Cherche la valeur qui correspond à la première combinaison
                        const matchingVal = v.values.find(val => firstCombValueIds.includes(String(val.id)));
                        if (matchingVal) {
                            // Si elle est trouvée, on la marque comme sélectionnée par défaut
                            defaultSelectedOptions[v.name] = matchingVal.id;
                        } else {
                            // Sinon, on prend la première valeur de la liste au hasard (fallback de sécurité)
                            defaultSelectedOptions[v.name] = v.values[0].id;
                        }
                    }
                }
            } else {
                // Si aucune combinaison explicite, on initialise la sélection par défaut avec la première valeur de chaque groupe
                for (let i = 0; i < structuredVariants.length; i++) {
                    let v = structuredVariants[i];
                    if (v && v.values && v.values.length > 0) {
                        defaultSelectedOptions[v.name] = safeId(v.values[0].id);
                    }
                }
            }
        }
    }

    // Retourne un objet riche prêt à être consommé par la Vue Produit
    return {
        product, // Données brutes du produit
        taxRate, // Taux de TVA (important pour le prix final)
        combinations: allCombinations, // Toutes les combinaisons PrestaShop (pour vérifier la disponibilité/prix)
        variants: structuredVariants, // Données d'interface formatées : [{ name: 'Taille', values: [...] }]
        defaultSelectedOptions // L'état initial du formulaire de choix d'options
    };
}

/**
 * Détermine l'ID de l'image correcte à afficher en fonction des options sélectionnées par l'utilisateur.
 * 
 * @param {string} defaultImageId L'ID de l'image par défaut du produit
 * @param {Array} productCombinations La liste de toutes les déclinaisons
 * @param {Object} selectedOptions Les options actuellement cochées par l'utilisateur (ex: { Taille: '2', Couleur: '5' })
 */
export function getCombinationImageId(defaultImageId, productCombinations, selectedOptions) {
    // On part du principe qu'on va afficher l'image par défaut
    let imageIdToFetch = defaultImageId;

    // S'il y a des déclinaisons disponibles
    if (productCombinations && productCombinations.length > 0) {
        // Construit un tableau avec les IDs des valeurs sélectionnées (les strings)
        const currentSelectedValues = [];
        for (const key of Object.keys(selectedOptions)) {
            if (selectedOptions[key]) {
                currentSelectedValues.push(String(selectedOptions[key]));
            }
        }

        // Variable pour stocker la déclinaison qui correspond exactement au choix de l'utilisateur
        let matchingComb = null;
        
        // Boucle sur toutes les déclinaisons du produit
        for (let i = 0; i < productCombinations.length; i++) {
            const comb = productCombinations[i];
            const combValues = comb.associations?.product_option_values?.product_option_value;
            // S'il n'y a pas de valeurs, on passe
            if (!combValues) continue;

            // Construit un tableau des IDs de valeurs pour cette combinaison
            const combValueIds = Array.isArray(combValues) ? combValues.map(v => safeId(v.id)) : [safeId(combValues.id)];

            // Vérifie si TOUTES les valeurs de cette combinaison sont présentes dans la sélection de l'utilisateur
            // (Note: ça suppose que le nombre d'options correspond exactement)
            if (combValueIds.every(id => currentSelectedValues.includes(id))) {
                matchingComb = comb; // On a trouvé la déclinaison exacte
                break;
            }
        }

        // Si on a trouvé la combinaison ET qu'elle a des images associées
        if (matchingComb && matchingComb.associations && matchingComb.associations.images && matchingComb.associations.images.image) {
            const imgData = matchingComb.associations.images.image;
            // Extrait l'ID de l'image (prend le premier si c'est un tableau)
            const specificImageId = safeId(Array.isArray(imgData) ? imgData[0].id : imgData.id || imgData);
            if (specificImageId) {
                // Remplace l'image par défaut par cette image spécifique
                imageIdToFetch = specificImageId;
            }
        }
    }
    // Renvoie l'ID final de l'image à afficher
    return imageIdToFetch;
}

/**
 * Détermine quelles valeurs d'options (ex: S, M, L) sont encore disponibles/cliquables 
 * pour une variante donnée en fonction des choix déjà faits dans les AUTRES variantes.
 * Cela empêche de sélectionner des combinaisons impossibles ou en rupture.
 * 
 * @param {Object} variant Le groupe de variante en cours de test (ex: Couleur)
 * @param {Array} allVariants Tous les groupes de variantes disponibles
 * @param {Array} productCombinations Toutes les combinaisons PrestaShop existantes
 * @param {Object} selectedOptions Les choix actuels de l'utilisateur
 */
export function getAvailableValuesForVariant(variant, allVariants, productCombinations, selectedOptions) {
    // Sécurité: Si la variante est vide, on retourne un tableau vide
    if (!variant || !variant.values) return [];
    // Si le produit n'a aucune combinaison, toutes les valeurs de la variante sont valables par défaut
    if (!productCombinations || productCombinations.length === 0) return variant.values;

    // Filtre les valeurs de la variante courante pour ne garder que celles qui sont possibles
    return variant.values.filter(val => {
        // On vérifie si CETTE valeur (val) existe dans au moins UNE combinaison (comb) valide
        return productCombinations.some(comb => {
            const combValues = comb.associations?.product_option_values?.product_option_value;
            // S'il n'y a pas de valeurs dans cette combinaison, ce n'est pas une bonne combinaison
            if (!combValues) return false;
            
            // Extrait les IDs des valeurs de cette combinaison
            const combValueIds = Array.isArray(combValues)
                ? combValues.map(v => safeId(v.id))
                : [safeId(combValues.id)];

            // Condition 1 : La combinaison analysée DOIT contenir la valeur (val) que l'on est en train de tester
            if (!combValueIds.includes(String(val.id))) return false;

            // Condition 2 : Pour cette même combinaison, toutes les AUTRES sélections déjà faites par l'utilisateur 
            // doivent correspondre (compatibilité croisée)
            for (const v of allVariants) {
                // On ignore la variante qu'on est en train de tester
                if (v.name === variant.name) continue;

                // Si le groupe de déclinaison (ex: Taille) n'est pas utilisé dans cette combinaison, on l'ignore
                const isGroupUsed = v.values.some(value => combValueIds.includes(String(value.id)));
                if (!isGroupUsed) continue;

                // Récupère le choix de l'utilisateur pour cet autre groupe
                const selectedValId = selectedOptions[v.name];
                // Si l'utilisateur a fait un choix ET que ce choix n'est PAS dans la combinaison testée
                if (selectedValId && !combValueIds.includes(String(selectedValId))) {
                    // Cette combinaison n'est pas compatible avec l'état actuel de l'UI
                    return false;
                }
            }

            // Si toutes les conditions sont réunies, la valeur est compatible avec l'état actuel et on la garde
            return true;
        });
    });
}
