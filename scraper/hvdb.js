const cheerio = require('cheerio'); // 解析器

const axios = require('./axios'); // 数据请求
const { nameToUUID } = require('./utils');
const { idNumberToCode } = require('../filesystem/utils');

// 修复之前抓取hvdb数据的bug，之前声优名字只能抓到最后一个单字而不是完整的名字，这里修复
function scrapeHvdbHtml(data) {
  // 转换成 jQuery 对象
  const $ = cheerio.load(data);
  const work = {tags: [], vas: []};
  work.title = $('input#Name').attr('value');

  function getId(text) {
    const reMatch = /\/(\d*)$/.exec(text);
    return reMatch ? reMatch[1] : "";
  }
  
  // circle
  const circleElement = $('a.detailCircle');
  const circleName = circleElement.text();
  work.circle = {
    id: getId(circleElement.attr('href')), 
    name: circleName.split("/")[0].trim()
  };

  // sfw
  work.nsfw = !$('input[name="SFW"]').attr('checked')

  // tags
  $('a[href*="TagWorks"]').each((idx, e) => {
    const elem = $(e);
    work.tags.push({
      id: getId(elem.attr('href')),
      name: elem.text(),
    });
  })

  // vas
  $('a[href*="CVWorks"]').each((idx, e) => {
    const elem = $(e);
    const cvName = elem.text();
    work.vas.push({
      id: nameToUUID(cvName),
      name: cvName,
    });
  })
  
  return work;
}

/**
 * Scrapes work metadata from public HVDB page HTML.
 * @param {number} id Work id.
 */
const scrapeWorkMetadataFromHVDB = id => new Promise((resolve, reject) => {
  const rjcode = idNumberToCode(id);
  const url = `https://hvdb.me/Dashboard/WorkDetails/${rjcode}`;

  console.log(`[RJ${rjcode}] 从 HVDB 抓取元数据...`);
  axios.retryGet(url, { retry: {} })
    .then(response => {
      console.log('res HVDB');
      return response.data;
    })
    .then((data) => { //解析
      const work = scrapeHvdbHtml(data);
      work.id = id;

      if (work.tags.length === 0 && work.vas.length === 0) {
        reject(new Error('Couldn\'t parse data from HVDB work page.'));
      } else {
        console.log(`[RJ${rjcode}] 成功从 HVDB 抓取元数据...`);
        resolve(work);
      }
    })
    .catch((error) => {
      if (error.response) {
        // 请求已发出，但服务器响应的状态码不在 2xx 范围内
        reject(new Error(`Couldn't request work page HTML (${url}), received: ${error.response.status}.`));
      } else if (error.request) {
        reject(error);
        console.log(error.request);
      } else {
        console.log('Error', error.message);
        reject(error);
      }
    });
});

module.exports = {
  scrapeWorkMetadataFromHVDB,
};
