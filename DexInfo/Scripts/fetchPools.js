const url = 'https://api.coingecko.com/api/v3/onchain/networks/bsc/dexes/pancakeswap_v2/pools';
const options = {
  method: 'GET',
  headers: {accept: 'application/json', 'x-cg-demo-api-key': 'CG-dgAPa1NhXtTyw8f9YJ1Fx25w'}
};

fetch(url, options)
  .then(res => res.json())
  .then(json => console.log(json))
  .catch(err => console.error(err));