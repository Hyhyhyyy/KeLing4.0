// Vite supplies these values in browser builds. Node's CommonJS test bundles
// need the same default environment explicitly, including the public base path.
module.exports = {
  'import.meta.env': JSON.stringify({
    BASE_URL: '/',
    VITE_API_BASE_URL: '/api',
    VITE_HOSTING_PLATFORM: '',
  }),
};
