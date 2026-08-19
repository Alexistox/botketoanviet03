/**
 * URL public của server Express (dùng cho /groups, /messagelogs, …).
 * Ưu tiên biến môi trường SERVER_URL hoặc BASE_URL.
 */
function getBaseUrl() {
  if (process.env.SERVER_URL) {
    return process.env.SERVER_URL.replace(/\/$/, '');
  }
  if (process.env.BASE_URL) {
    return process.env.BASE_URL.replace(/\/$/, '');
  }
  if (process.env.HEROKU_APP_NAME) {
    return `https://${process.env.HEROKU_APP_NAME}.herokuapp.com`;
  }
  // VPS production mặc định (cùng máy Botketoan01, port app này thường 3000)
  return 'http://159.223.49.204:3000';
}

module.exports = { getBaseUrl };
