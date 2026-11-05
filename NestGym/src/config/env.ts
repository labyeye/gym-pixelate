// Central place for environment-specific values.
// Debug builds (npm run android) talk to your laptop: set DEV_API to your machine's LAN IP + backend port (5000).
// Release builds (Play Store) use HTTPS only: set PROD_API to the deployed backend before building the bundle.
const DEV_API = 'http://192.168.1.139:5000/api';
const PROD_API = 'https://gym-backend.pixelatenest.com/api'; // TODO: confirm this domain resolves before release
export const API_BASE_URL = __DEV__ ? DEV_API : PROD_API;
export const WEB_APP_URL = 'https://gym.pixelatenest.com';
