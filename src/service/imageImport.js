// Importation des utilitaires d'API et de gestion d'erreur
import { getXml, postImage, formatApiError } from '@/service/api';
// Mécanismes de restauration (rollback) en cas d'échec critique lors d'un import
import { runResetForTargets } from '@/service/resetService';
import { resetTargets } from '@/service/resetTargets';
// Librairie pour décompresser les fichiers .zip côté client
import JSZip from 'jszip';

/**
 * Traite un fichier ZIP contenant une collection d'images de produits pour les importer dans PrestaShop.
 * La convention stricte attendue est que le nom du fichier image corresponde EXACTEMENT 
 * à la référence du produit (ex: "REF123.jpg" pour le produit dont la réf est "REF123").
 *
 * @param {File} zipFile L'archive .zip téléchargée depuis l'interface par l'utilisateur.
 * @param {function} logCallback Une fonction de rappel (callback) permettant d'afficher la progression en temps réel sur l'UI.
 */
export const processImageImport = async (zipFile, logCallback) => {
    logCallback('info', 'Début du traitement du fichier ZIP...');
    // Cache local pour éviter de requêter l'API plusieurs fois pour la même référence (ex: M_02.jpg et M_02_1.jpg)
    const productCache = {};

    try {
        // 1. Décompression asynchrone du ZIP en mémoire
        const zip = await JSZip.loadAsync(zipFile);
        const imageFiles = [];

        // 2. Nettoyage de l'archive (exclusion des dossiers et des fichiers systèmes)
        zip.forEach((relativePath, file) => {
            // Ignore les répertoires et les fichiers systèmes (spécifiques à macOS comme .DS_Store)
            if (!file.dir && !relativePath.startsWith('__MACOSX/')) {
                imageFiles.push(file);
            }
        });

        if (imageFiles.length === 0) {
            logCallback('warn', 'Aucun fichier image valide trouvé dans le fichier ZIP.');
            return;
        }

        logCallback('success', `${imageFiles.length} image(s) valide(s) trouvé(s) dans le ZIP.`);

        // 3. Boucle principale de traitement image par image
        for (const [index, imageFile] of imageFiles.entries()) {
            const filename = imageFile.name;

            // --- LOGIQUE DE MAPPING ---
            // On extrait la référence du produit en retirant l'extension du fichier
            // "M_02.jpeg" -> "M_02"
            // "T_01.png" -> "T_01"
            const productRef = filename.substring(0, filename.lastIndexOf('.'));

            if (!productRef) {
                logCallback('warn', `Fichier ignoré : nom de fichier invalide "${filename}".`);
                continue;
            }

            logCallback('info', `Traitement de l'image ${index + 1}/${imageFiles.length} : "${filename}" pour la référence produit "${productRef}".`);

            try {
                // Étape A : Trouver l'ID du produit correspondant à cette référence
                let productId = productCache[productRef];
                if (!productId) {
                    // Si pas dans le cache, on cherche sur l'API PrestaShop
                    const productSearch = await getXml(`/products?filter[reference]=[${encodeURIComponent(productRef)}]&display=[id]`);
                    const productNode = productSearch?.prestashop?.products?.product;

                    if (!productNode) {
                        throw new Error(`Produit non trouvé.`);
                    }
                    // Gère le cas où l'API renvoie un seul objet ou un tableau de produits
                    const product = Array.isArray(productNode) ? productNode[0] : productNode;
                    productId = product.id;
                    // Mise en cache pour les prochaines itérations
                    productCache[productRef] = productId;
                }

                // Étape B : Convertir le fichier zippé en objet File compatible avec l'API
                const imageBlob = await imageFile.async('blob');
                const imageAsFile = new File([imageBlob], filename, { type: imageBlob.type });

                // Étape C : Envoyer l'image vers PrestaShop via l'endpoint dédié
                const uploadUrl = `/images/products/${productId}`;
                await postImage(uploadUrl, imageAsFile);

                logCallback('success', `Image "${filename}" importée avec succès pour le produit ID ${productId}.`);

            } catch (error) {
                console.error(`Erreur pour l'image "${filename}" (Ref: ${productRef}):`, error);
                logCallback('error', `Erreur pour l'image "${filename}" (Ref: ${productRef}) : ${formatApiError(error)}`);
            }
            // Temporisation artificielle de 500ms pour ne pas saturer l'API serveur
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        logCallback('success', 'Import des images terminé.');

    } catch (error) {
        // Gestion des erreurs critiques (Fichier ZIP corrompu, perte de réseau totale)
        console.error('Erreur lors de la lecture du fichier ZIP / import des images:', error);
        logCallback('error', `Erreur lors du traitement du ZIP / import des images : ${formatApiError(error)}`);
        
        // --- MÉCANISME DE ROLLBACK ---
        // Si l'import échoue de manière critique, on lance une réinitialisation de la base pour éviter des données corrompues
        try {
            await runResetForTargets(resetTargets, (type, message) => logCallback(type, `Rollback global: ${message}`));
        } catch (e) {
            console.error('Échec du rollback global:', e);
            logCallback('warn', `Échec du rollback global : ${formatApiError(e)}`);
        }
    }
};