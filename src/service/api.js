import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
import XMLBuilder from 'fast-xml-builder';

const urlBase = import.meta.env.VITE_API_URL;
const apiKey = import.meta.env.VITE_API_KEY;
const basicAuthHeader = `Basic ${btoa(`${apiKey}:`)}`;

export const api = axios.create({
  // Utilise l'URL exacte qui fonctionne
  baseURL: urlBase,
  headers: {
    Authorization: basicAuthHeader
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

function isXmlString(value) {
  return typeof value === 'string' && value.trim().startsWith('<');
}

function parseXmlSafe(xml) {
  try {
    return xmlParser.parse(xml);
  } catch (error) {
    return xml;
  }
}

function parseResponseData(data) {
  return isXmlString(data) ? parseXmlSafe(data) : data;
}

export function parsePrestaXml(xmlString) {
  return xmlParser.parse(xmlString);
}

export function buildPrestaXml(payload) {
  return typeof payload === 'string' ? payload : xmlBuilder.build(payload);
}

function withXmlDefaults(config = {}) {
  return {
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
  };
}

export async function getXml(url, config) {
  const response = await api.get(url, withXmlDefaults(config));
  const parsed = parseResponseData(response.data);

  if (parsed && typeof parsed === 'object' && parsed.prestashop) {
    const p = parsed.prestashop;
    const productsNode = p.products;

    if (productsNode === '' || productsNode === null) {
      p.products = { product: [] };
    }
    else if (typeof productsNode === 'object') {
      // empty object -> no products
      if (Object.keys(productsNode).length === 0) {
        p.products = { product: [] };
      }
      else if (!('product' in productsNode)) {
        // If productsNode itself is an array of products (rare), wrap it
        if (Array.isArray(productsNode)) {
          p.products = { product: productsNode };
        }
      }
      else {
        // Ensure single product object becomes an array
        if (productsNode.product && !Array.isArray(productsNode.product)) {
          productsNode.product = [productsNode.product];
        }
      }
    }
  }

  return parsed;
}

export async function postXml(url, payload, config) {
  const body = buildPrestaXml(payload);
  const response = await api.post(url, body, {
    ...withXmlDefaults(config),
    headers: {
      'Content-Type': 'application/xml',
      ...(config?.headers || {})
    }
  });
  return parseResponseData(response.data);
}

export async function putXml(url, payload, config) {
  const body = buildPrestaXml(payload);
  const response = await api.put(url, body, {
    ...withXmlDefaults(config),
    headers: {
      'Content-Type': 'application/xml',

      ...(config?.headers || {})
    }
  });
  return parseResponseData(response.data);
}

export async function deleteXml(url, config) {
  const response = await api.delete(url, withXmlDefaults(config));
  return parseResponseData(response.data);
}

export async function getImage(url) {
  const response = await api.get(url, {
    responseType: 'blob',
    headers: {
      Accept: 'image/*'
    }
  });
  return URL.createObjectURL(response.data);
}
