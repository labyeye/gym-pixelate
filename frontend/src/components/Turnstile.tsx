import { useEffect, useRef } from "react";
import { setCaptchaToken } from "@/services/api";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

// Cloudflare Turnstile widget. Renders nothing unless VITE_TURNSTILE_SITE_KEY is set; the token rides along
// on API calls as X-Captcha-Token (see services/api.ts).
export default function Turnstile() {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!SITE_KEY || !box.current) return;
    let id: string | undefined;
    const draw = () => {
      const t = (window as any).turnstile;
      if (!t || !box.current) return;
      id = t.render(box.current, {
        sitekey: SITE_KEY,
        callback: (tok: string) => setCaptchaToken(tok),
        "expired-callback": () => setCaptchaToken(null),
      });
    };
    if ((window as any).turnstile) draw();
    else {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = draw;
      document.head.appendChild(s);
    }
    return () => {
      if (id) (window as any).turnstile?.remove(id);
      setCaptchaToken(null);
    };
  }, []);
  return SITE_KEY ? <div ref={box} className="my-2" /> : null;
}
