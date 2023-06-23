const cheerio = require('cheerio'); // 解析器

const axios = require('./axios'); // 数据请求
const { nameToUUID, hasLetter } = require('./utils');
const scrapeWorkMetadataFromHVDB = require('./hvdb');
const { formatID } = require('../filesystem/utils');

/**
 * Scrapes static work metadata from public DLsite page HTML.
 * @param {number} id Work id.
 * @param {String} language 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 */
const scrapeStaticWorkMetadataFromDLsite = (id, language) => new Promise((resolve, reject) => {
  const rjcode = formatID(id);
  const url = `https://www.dlsite.com/maniax/work/=/product_id/RJ${rjcode}.html`;

  const work = { id, tags: [], vas: [] };
  let AGE_RATINGS, VA, GENRE, RELEASE, SERIES, COOKIE_LOCALE;
  switch(language) {
    case 'ja-jp':
      COOKIE_LOCALE = 'locale=ja-jp';
      AGE_RATINGS = '年齢指定';
      GENRE = 'ジャンル';
      VA = '声優';
      RELEASE = '販売日';
      SERIES = 'シリーズ名';
      break;
    case 'zh-tw':
      COOKIE_LOCALE = 'locale=zh-tw';
      AGE_RATINGS = '年齡指定';
      GENRE = '分類';
      VA = '聲優';
      RELEASE = '販賣日';
      SERIES = '系列名';
      break;
    default:
      COOKIE_LOCALE = 'locale=zh-cn';
      AGE_RATINGS = '年龄指定';
      GENRE = '分类';
      VA = '声优';
      RELEASE = '贩卖日';
      SERIES = '系列名';
  }

  axios.retryGet(url, {
    retry: {},
    headers: { "cookie": COOKIE_LOCALE } // 自定义请求头
  })
    .then(response => response.data)
    .then((data) => { // 解析
      // 转换成 jQuery 对象
      const $ = cheerio.load(data);

      // 标题
      work.title = $('meta[property="og:title"]').attr('content');
      // fallback
      if (work.title === undefined) {
        work.title = $(`a[href="${url}"] span`).text();
      }
      
      // 'xxxxx [circle_name] | DLsite' => 'xxxxx'
      const titlePattern = / \[.+\] \| DLsite$/;
      work.title = work.title.replace(titlePattern, '');

      // 社团
      const circleElement = $('span[class="maker_name"]').children('a');
      const circleUrl = circleElement.attr('href');
      const circleName = circleElement.text();
      work.circle = (circleUrl && circleName)
        ? { id: parseInt(circleUrl.substr(-10,5)), name: circleName }
        : {};

      const workOutline = $('#work_outline');
      // NSFW
      const R18 = workOutline.children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === AGE_RATINGS;
        }).parent().children('td').find('span:first').text();
      work.nsfw = R18 === '18禁';

      // 贩卖日 (YYYY-MM-DD)
      const release = workOutline.children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === RELEASE;
        }).parent().children('td').text().replace(/[^0-9]/ig,'');
      work.release = (release.length >= 8)
        ? `${release.slice(0, 4)}-${release.slice(4, 6)}-${release.slice(6, 8)}`
        : '';

      // 系列
      const seriesElement = workOutline.children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === SERIES;
        }).parent().children('td').children('a');
      if (seriesElement.length) {
        const seriesUrl = seriesElement.attr('href');
        if (seriesUrl.match(/SRI(\d{10})/)) {
          work.series = {
            id: parseInt(seriesUrl.match(/SRI(\d{10})/)[1]),
            name: seriesElement.text()
          };
        }
      }
      
      // 标签
        workOutline.children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === GENRE;
        }).parent().children('td').children('div').children('a').each(function() {
          const tagUrl = $(this).attr('href');
          const tagName = $(this).text();
          if (tagUrl.match(/genre\/(\d{3})/)) {
            work.tags.push({
              id: parseInt(tagUrl.match(/genre\/(\d{3})/)[1]),
              name: tagName
            });
          }
        });
      
      // 声优
        workOutline.children('tbody').children('tr').children('th')
        .filter(function() {
          return $(this).text() === VA;
        }).parent().children('td').children('a').each(function() {
          const vaName = $(this).text().trim();
          work.vas.push({
            id: nameToUUID(vaName),
            name: vaName
          });
        });

      if (work.tags.length === 0 && work.vas.length === 0) {
        reject(new Error('Couldn\'t parse data from DLsite work page.'));
      }
    })
    .then(() => {
      if (work.vas.length === 0) { 
        // 从 DLsite 抓不到声优信息时, 从 HVDB 抓取声优信息
        scrapeWorkMetadataFromHVDB(id)
          .then((metadata) => {
            if (metadata.vas.length <= 1) {
              // N/A
              work.vas = metadata.vas;
            } else {
              // 过滤掉英文的声优名
              metadata.vas.forEach(function(va) {
                if (!hasLetter(va.name)) {
                  work.vas.push(va);
                }
              });
            }
  
            resolve(work);
          })
          .catch((error) => {
            reject(new Error(error.message));
          });
      } else {
        resolve(work);
      } 
    })
    .catch((error) => {
      if (error.response) {
        // 请求已发出，但服务器响应的状态码不在 2xx 范围内
        reject(new Error(`Couldn't request work page HTML (${url}), received: ${error.response.status}.`));
      } else {
        reject(error);
      }
    });
});

/**
 * Requests dynamic work metadata from public DLsite API.
 * @param {number} id Work id.
 */
const scrapeDynamicWorkMetadataFromDLsite = id => new Promise((resolve, reject) => {
  const rjcode = formatID(id);
  const url = `https://www.dlsite.com/maniax-touch/product/info/ajax?product_id=RJ${rjcode}`;

  axios.retryGet(url, { retry: {} })
    .then(response => response.data[`RJ${rjcode}`])
    .then((data) => {
      const work = {};
      work.dl_count = data.dl_count ? data.dl_count : "0"; // 售出数
      work.rate_average_2dp = data.rate_average_2dp ? data.rate_average_2dp : 0.0; // 平均评价
      work.rate_count = data.rate_count ? data.rate_count : 0; // 评价数量
      work.rate_count_detail = data.rate_count_detail; // 评价分布明细
      work.review_count = data.review_count; // 评论数量
      work.price = data.price; // 价格
      if (data.rank.length) {
        work.rank = data.rank; // 成绩
      }
      console.log(`[RJ${rjcode}] 成功从 DLSite 抓取Dynamic元数据...`);
      resolve(work);
    })
    .catch((error) => {
      if (error.response) {
        // 请求已发出，但服务器响应的状态码不在 2xx 范围内
        reject(new Error(`Couldn't request work page HTML (${url}), received: ${error.response.status}.`));
      } else {
        reject(error);
      }
    });
});

/**
 * Scrapes work metadata from public DLsite page HTML.
 * @param {number} id Work id.
 * @param {String} language 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 */
const scrapeWorkMetadataFromDLsite = (id, language) => {
  return Promise.all([
    scrapeStaticWorkMetadataFromDLsite(id, language),
    scrapeDynamicWorkMetadataFromDLsite(id)
  ])
    .then((res) => {
      const work = {};
      return Object.assign(work, res[0], res[1]);
    });
};

/**
 * Scrapes the source cover work id which holds the cover image, 
 * since some translated work(id_translated) in dlsite do not has its own cover, 
 * but share the cover from original cover work(id_source).
 * @param {number} id_translated Work id.
 * @param {String} language 标签语言，'ja-jp', 'zh-tw' or 'zh-cn'，默认'zh-cn'
 */
const scrapeCoverIdForTranslatedWorkFromDLsite = (id_translated, language) => new Promise((resolve, reject) => {
  const rjcode = formatID(id_translated);
  const url = `https://www.dlsite.com/maniax/work/=/product_id/RJ${rjcode}.html`;

  const work = { id_translated, tags: [], vas: [] };
  let AGE_RATINGS, VA, GENRE, RELEASE, SERIES, COOKIE_LOCALE;
  switch(language) {
    case 'ja-jp':
      COOKIE_LOCALE = 'locale=ja-jp';
      AGE_RATINGS = '年齢指定';
      GENRE = 'ジャンル';
      VA = '声優';
      RELEASE = '販売日';
      SERIES = 'シリーズ名';
      break;
    case 'zh-tw':
      COOKIE_LOCALE = 'locale=zh-tw';
      AGE_RATINGS = '年齡指定';
      GENRE = '分類';
      VA = '聲優';
      RELEASE = '販賣日';
      SERIES = '系列名';
      break;
    default:
      COOKIE_LOCALE = 'locale=zh-cn';
      AGE_RATINGS = '年龄指定';
      GENRE = '分类';
      VA = '声优';
      RELEASE = '贩卖日';
      SERIES = '系列名';
  }

  axios.retryGet(url, {
    retry: {},
    headers: { "cookie": COOKIE_LOCALE } // 自定义请求头
  })
    .then(response => response.data)
    .then((data) => { // 解析
      // 转换成 jQuery 对象
      const $ = cheerio.load(data);

      // 所有关联的作品id，包括日文、各种语种翻译的作品id
      const linked_id_list = $('.work_edition_linklist.type_trans a.work_edition_linklist_item').get()
        .map(l => l.attribs['href'])
        .filter(h => typeof h === 'string')
        .map(h => /RJ(\d{6,8})/.exec(h))
        .filter(r => r != null && r.length >= 2)
        .map(r =>r[1]);
      
      // 当前页面中使用到的一些图像链接id，用来判断当前作品的cover究竟来自哪一个作品
      const possible_image_id_list = $('img').get()
        .map(e => e.attribs['srcset'])
        .filter(h => typeof h === 'string')
        .map(h => /RJ(\d{6,8})[_\w\.]+$/.exec(h))
        .filter(r => r != null && r.length >= 2)
        .map(r => r[1])

        console.log("linked:", linked_id_list)
        console.log("possible:", possible_image_id_list)

      const hit_id_list = linked_id_list.filter(id => possible_image_id_list.includes(id));
      resolve(hit_id_list.length > 0 ? hit_id_list[0] : id_translated);
    })
    .catch((error) => {
      if (error.response) {
        // 请求已发出，但服务器响应的状态码不在 2xx 范围内
        reject(new Error(`Couldn't request work page HTML (${url}), received: ${error.response.status}.`));
      } else {
        reject(error);
      }
    });
});

module.exports = {
  scrapeWorkMetadataFromDLsite,
  scrapeDynamicWorkMetadataFromDLsite,
  scrapeCoverIdForTranslatedWorkFromDLsite,
};
