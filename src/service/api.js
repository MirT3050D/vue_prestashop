import axios from 'axios';
const urlBase = import.meta.env.VITE_API_URL
export const api = axios.create({
  // Utilise l'URL exacte qui fonctionne
  baseURL: urlBase,
  auth: {
    username: '4TL3WHGWM1LYH3QMDN2ZMXLY7IGUXK5N', // Exemple: 1A2B3C4D5E6F...
    password: '' // Toujours vide pour PrestaShop
  },
  params: {
    output_format: 'JSON'
  }
});