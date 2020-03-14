/**
 * Generates a hash integer from a given string. Hopefully only temporary until
 * reshnix exposes VA ids for scraping.
 * @param {String} name
 */
const hashNameIntoInt = (name) => {
  let hash = '';
  
  for (let i = 0; i < name.length; i += 1) {
    const char = name.charCodeAt(i);
    // eslint-disable-next-line no-bitwise
    hash = ((hash << 5) - hash) + char;
  }
  
  // eslint-disable-next-line no-bitwise
  hash |= 0;
  hash = Math.abs(Math.round(hash / 1000));
  return hash;
};

/**
 * 在字符串固定位置插入字符
 * @param {String} soure 原字符串
 * @param {Number} start 将要插入字符的位置
 * @param {String} newStr 要插入的字符
 */
const insertStr = (soure, start, newStr) => soure.slice(0, start) + newStr + soure.slice(start);

/**
 * 判断一个字符串中是否包含字母
 * @param {String} str
 */
const hasLetter = (str) => {
  for (let i in str) {
    let asc = str.charCodeAt(i);
    if ((asc >= 65 && asc <= 90 || asc >= 97 && asc <= 122)) {
      return true;
    }
  }
  return false;
};

module.exports = {
  hashNameIntoInt, insertStr, hasLetter
};