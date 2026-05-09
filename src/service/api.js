import axios from 'axios';
import { XMLBuilder, XMLParser } from 'fast-xml-parser';

const urlBase = import.meta.env.VITE_API_URL;

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

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

const xmlBuilder = new XMLBuilder({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  format: true
});

const isXmlString = (value) => typeof value === 'string' && value.trim().startsWith('<');

const parseXmlSafe = (xml) => {
  try {
    return xmlParser.parse(xml);
  } catch (error) {
    return xml;
  }
};

const parseResponseData = (data) => (isXmlString(data) ? parseXmlSafe(data) : data);

export const parsePrestaXml = (xmlString) => xmlParser.parse(xmlString);

export const buildPrestaXml = (payload) =>
  typeof payload === 'string' ? payload : xmlBuilder.build(payload);

const withXmlDefaults = (config = {}) => ({
  ...config,
  responseType: 'text',
  params: {
    output_format: 'XML',
    ...(config.params || {})
  },
  headers: {
    Accept: 'application/xml',
    ...(config.headers || {})
  }
});

export const getXml = async (url, config) => {
  const response = await api.get(url, withXmlDefaults(config));
  return parseResponseData(response.data);
};

export const postXml = async (url, payload, config) => {
  const body = buildPrestaXml(payload);
  const response = await api.post(url, body, {
    ...withXmlDefaults(config),
    headers: {
      'Content-Type': 'application/xml',
      ...(config?.headers || {})
    }
  });
  return parseResponseData(response.data);
};

export const putXml = async (url, payload, config) => {
  const body = buildPrestaXml(payload);
  const response = await api.put(url, body, {
    ...withXmlDefaults(config),
    headers: {
      'Content-Type': 'application/xml',
      ...(config?.headers || {})
    }
  });
  return parseResponseData(response.data);
};

export const deleteXml = async (url, config) => {
  const response = await api.delete(url, withXmlDefaults(config));
  return parseResponseData(response.data);
};