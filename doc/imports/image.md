# Importation : Images Produits (`imageImport.js`)

Ce service permet d'importer en bloc des images de produits regroupées au sein d'un fichier ZIP et de les associer automatiquement à leurs produits respectifs.

---

## ⚙️ Fonctionnement et Règles Métier

1.  **Extraction ZIP (JSZip)** :
    *   Lit le fichier ZIP fourni par l'utilisateur et extrait les fichiers images valides en ignorant les dossiers système (ex: `__MACOSX/`).
2.  **Mise en Correspondance des Références** :
    *   La référence produit est déduite directement du nom du fichier sans son extension.
    *   Exemple : `REF100.jpg` est associé au produit ayant pour référence `REF100`.
3.  **Appel API Multipart (`postImage`)** :
    *   Recherche l'identifiant unique du produit dans PrestaShop via sa référence.
    *   Convertit les données binaires du ZIP en fichier `File` / `Blob` JavaScript.
    *   Effectue un envoi de type `multipart/form-data` vers l'endpoint `/images/products/{id}`.

---

## 🛠️ Code Principal

Voici l'implémentation de la lecture du ZIP et de l'upload d'images dans `src/service/imageImport.js` :

```javascript
import { getXml, postImage } from '@/service/api';
import JSZip from 'jszip';

export const processImageImport = async (zipFile, logCallback) => {
    try {
        const zip = await JSZip.loadAsync(zipFile);
        const imageFiles = [];

        zip.forEach((relativePath, file) => {
            if (!file.dir && !relativePath.startsWith('__MACOSX/')) {
                imageFiles.push(file);
            }
        });

        for (const [index, imageFile] of imageFiles.entries()) {
            const filename = imageFile.name;
            const productRef = filename.substring(0, filename.lastIndexOf('.'));

            if (!productRef) continue;

            try {
                // 1. Recherche du produit dans PrestaShop
                let productId = productCache[productRef];
                if (!productId) {
                    const productSearch = await getXml(`/products?filter[reference]=[${encodeURIComponent(productRef)}]&display=[id]`);
                    const productNode = productSearch?.prestashop?.products?.product;

                    if (!productNode) throw new Error(`Produit non trouvé.`);
                    
                    const product = Array.isArray(productNode) ? productNode[0] : productNode;
                    productId = product.id;
                    productCache[productRef] = productId;
                }

                // 2. Conversion en Blob puis en Fichier
                const imageBlob = await imageFile.async('blob');
                const imageAsFile = new File([imageBlob], filename, { type: imageBlob.type });

                // 3. Upload HTTP Multipart via la passerelle image
                await postImage(`/images/products/${productId}`, imageAsFile);
                logCallback('success', `Image "${filename}" importée avec succès.`);

            } catch (error) {
                logCallback('error', `Erreur pour l'image "${filename}" : ${error.message}`);
            }
        }
    } catch (error) {
        logCallback('error', `Erreur de traitement ZIP : ${error.message}`);
    }
};
```
