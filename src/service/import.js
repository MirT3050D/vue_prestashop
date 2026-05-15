export { processImport } from './productImport';
export { processVariantImport, rollbackDeclinaison, resetDeclinaisonTargets } from './variantImport';
export { rollbackProducts } from './productImport';

// Backwards compatibility: existing imports from '@/service/import' will be
// re-exported from the new specialized modules above.


