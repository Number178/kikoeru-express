const path = require('path');
const urljoin = require('url-join');

// work.dir and track.subtitle may contain '/' or '\' if they have subfolders
// ["RJ123456", "画像/好きな人?"] => ["RJ123456", "%E7%94%BB%E5%83%8F", "%E5%A5%BD%E3%81%8D%E3%81%AA%E4%BA%BA%3F"]
const encodeSplitFragments = (fragments) => {
  // On windows, replace "dir\RJ123456" => "dir/RJ123456"
  const expandedFragments = fragments.map(fragment => fragment.replace(/\\/g, '/').split('/'))
  return expandedFragments.flat().map(fragment => encodeURIComponent(fragment));
}

const joinFragments = (baseUrl, ...fragments) => {
  const pattern = new RegExp(/^https?:\/\//);
  const encodedFragments = encodeSplitFragments(fragments);

  // http(s)://example.com/
  if (pattern.test(baseUrl)) {
    return urljoin(baseUrl, ...encodedFragments);
  } else {
    // /media/stream/
    return path.join(baseUrl, ...fragments).replace(/\\/g, '/');
  }
}

module.exports = { joinFragments }