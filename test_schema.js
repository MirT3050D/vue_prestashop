const http = require('http');

http.get('http://localhost:8080/api/carts?schema=blank&ws_key=QCAY4SY9QW1QJHYK92V88XYU673N765A', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log(data));
});
