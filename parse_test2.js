const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

async function test() {
  try {
    const response = await axios.get("http://localhost:8081/prestashop_edition_classic_version_8.2.6/api/product_option_values?display=full&filter[id]=[1|2]", {
      headers: { Authorization: "Basic " + Buffer.from("WYGXIZI9DU3H577C3JKWY1YWZZGAULFH:").toString('base64') }
    });
    const parsed = xmlParser.parse(response.data);
    console.log(JSON.stringify(parsed.prestashop.product_option_values.product_option_value, null, 2));
  } catch (e) {
    console.error(e.message);
  }
}
test();
