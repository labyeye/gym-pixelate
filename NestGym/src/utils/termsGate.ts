// The backend refuses every call with 403 TERMS_REQUIRED until the user accepts the current Terms (utils/terms.js).
// api.ts calls announceTerms(); <TermsGate/> listens and shows the accept sheet.
type L = () => void;
const ls = new Set<L>();
export const onTermsRequired = (fn: L) => {
  ls.add(fn);
  return () => {
    ls.delete(fn);
  };
};
export const announceTerms = () => ls.forEach((f) => f());
