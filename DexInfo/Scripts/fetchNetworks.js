const url = 'https://api.coingecko.com/api/v3/onchain/networks';
const options = {
  method: 'GET',
  headers: {accept: 'application/json', 'x-cg-demo-api-key': 'CG-dgAPa1NhXtTyw8f9YJ1Fx25w'}
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(JSON.stringify(json, null, 4)))
  .catch(err => console.error(err));

