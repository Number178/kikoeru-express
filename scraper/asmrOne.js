const cheerio = require('cheerio'); // 解析器

const axios = require('./axios'); // 数据请求
const { nameToUUID, hasLetter } = require('./utils');
const { idNumberToCode } = require('../filesystem/utils');

let asmrOneApiUrl = '';

async function updateAsmrOneApiUrl() {
  const url = `https://asmr.one/index.html`;
  try {
    const response = await axios.retryGet(url, {
      retry: {},
      headers: { "cookie": 'locale=zh-cn' },
    });

    const $ = cheerio.load(response.data)

    asmrOneApiUrl = $('link[rel="preconnect"][as="fetch"]').attr('href');

    console.log('asmr one api url = ', asmrOneApiUrl);
  } catch {
    console.warn("获取ASMROne api url失败");
  }
}

async function scrapeWorkMetadataFromAsmrOne(id) {
  if (asmrOneApiUrl === '') await updateAsmrOneApiUrl();

  const rjcode = idNumberToCode(id);
  const url = `https://api.asmr-200.com/api/workInfo/${rjcode}`;
  const response = await axios.retryGet(url, {
    retry: {},
    headers: { "cookie": 'locale=zh-cn' },
  });
  // const data = JSON.parse(response.data);
  const data = response.data;

  // va的UUID可能和asmrOne不同，这里做一次强制转换
  data.vas.forEach((va) => {
    va.id = nameToUUID(va.name);
  });

  return data;
}

module.exports = {
  scrapeWorkMetadataFromAsmrOne,
}
