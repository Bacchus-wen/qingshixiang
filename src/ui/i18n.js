// The language the piece speaks (2026-10-22, the user: "做成英文版"): ?lang=en or ?lang=zh, otherwise the browser's own --
// Chinese for zh*, English for everything else. Only what is said to the viewer changes: titles, hints, the end card,
// the review labels. The street keeps its Chinese signs, its notices and 拆: they are the place, not the interface.
const q = new URLSearchParams(location.search).get('lang');
export const LANG = q === 'en' || q === 'zh' ? q : /^zh/i.test(navigator.languages?.[0] || navigator.language || '') ? 'zh' : 'en';
export const zh = LANG === 'zh';
// the two texts side by side where they are used: tr('按住', 'Hold')
export const tr = (zhText, enText) => (zh ? zhText : enText);
document.documentElement.lang = zh ? 'zh-CN' : 'en';
document.title = tr('青石巷', 'Bluestone Lane');
// the same page in the other language (the title screen's small link)
export function otherLangHref() {
  const u = new URL(location.href); u.searchParams.set('lang', zh ? 'en' : 'zh'); return u.pathname + u.search + u.hash;
}
