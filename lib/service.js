// service.js
const axios = require('axios').default;
const {throttleAdapterEnhancer} = require('axios-extensions');

const wikiInstance = axios.create({
  baseURL: process.env.WIKI_URL || 'https://tamil.wiki/',
  timeout: process.env.TIMEOUT || 10000, // 10 seconds,
  responseType: 'json',
  adapter: throttleAdapterEnhancer(axios.defaults.adapter, { threshold: 500 })
});

const getWikiPageData = async (wikiParams) => {

  return new Promise(async (resolve, reject) => {

    try {
      const pageData = await wikiInstance.get('/api.php', {
        params: wikiParams
      });
      if (pageData.status == 200) {
        //console.log(pageData.data);
        resolve(pageData.data);
      } else {
        reject(pageData.status);
      }
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  wikiService: getWikiPageData
}