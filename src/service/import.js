// Fichier "Barrel" (ou index). 
// Son seul rôle est de regrouper et réexporter les fonctions des différents modules d'import.
// Cela permet aux autres fichiers de faire `import { processProductImport } from '@/service/import'`
// au lieu de devoir pointer spécifiquement sur `@/service/productImport`.

export { processProductImport, rollbackProducts } from './productImport';
export { processVariantImport, rollbackDeclinaison } from './variantImport';
export { processOrderImport, rollbackOrders } from './orderImport';

// Compatibilité descendante : les imports existants depuis '@/service/import' 
// continueront de fonctionner en pointant vers ces nouveaux modules spécialisés.
