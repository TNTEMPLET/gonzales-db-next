/** Which feeder slots (canonical pair) have a visible match vs empty bye band. */
export type BracketConnectorVariant = "both" | "top" | "bottom" | "none" | "center";

export function getBracketConnectorVariant(
  hasTopFeeder: boolean,
  hasBottomFeeder: boolean,
): BracketConnectorVariant {
  if (hasTopFeeder && hasBottomFeeder) return "both";
  if (hasTopFeeder) return "top";
  if (hasBottomFeeder) return "bottom";
  return "none";
}

/**
 * Legacy viewBox for static references. Prefer {@link bracketConnectorSingleFromSize} (measured cells).
 * @deprecated
 */
export const BRACKET_CONNECTOR_VIEWBOX = "0 0 80 100" as const;

/**
 * Canonical Y (0–100) for bracket connectors in a gutter that spans **two stacked feeder rows**
 * (same vertical span as the next-round match). Arms sit at the **midline of each feeder half**
 * (25% / 75%); the hub and outgoing trunk sit at **50%** so the line meets the **vertical center**
 * of the destination match (between its two slots). Matches cards without a game badge row; if
 * badges are added later, nudge the hub percentage slightly (e.g. toward 48–49).
 */
const BOTH_Y = { topArm: 25, hub: 50, botArm: 75 } as const;

/** Assumed gutter size for static HTML before the export paint script runs (fallback only). */
export const BRACKET_CONNECTOR_EXPORT_ASSUMED_W = 52;
export const BRACKET_CONNECTOR_EXPORT_ASSUMED_H = 480;

/**
 * Build a single SVG path + viewBox whose **aspect ratio matches the gutter cell**
 * (`widthPx` × `heightPx`). With `preserveAspectRatio="none"`, the browser maps viewBox → pixel
 * box with **one** scale factor horizontally and vertically — equal when aspects match, so the
 * bracket lines stay proportional (no extreme shear from a fixed 40×100 viewBox in a tall cell).
 */
export function bracketConnectorBothFromSize(
  widthPx: number,
  heightPx: number,
  hubYPercent: number = BOTH_Y.hub,
): { viewBox: string; d: string } {
  const w = Math.max(4, widthPx);
  const h = Math.max(4, heightPx);
  const vbH = (40 * h) / w;
  const s = vbH / 100;
  const yv = (v: number) => v * s;
  const hub = Math.max(2, Math.min(98, hubYPercent));
  const d = `M 2 ${yv(BOTH_Y.topArm)} L 20 ${yv(BOTH_Y.topArm)} L 20 ${yv(hub)} L 40 ${yv(hub)} M 2 ${yv(BOTH_Y.botArm)} L 20 ${yv(BOTH_Y.botArm)} L 20 ${yv(hub)}`;
  return { viewBox: `0 0 40 ${vbH}`, d };
}

/** One feeder only: same aspect-ratio viewBox as {@link bracketConnectorBothFromSize} (uniform scale, no shear). */
export function bracketConnectorSingleFromSize(
  widthPx: number,
  heightPx: number,
  variant: "top" | "bottom",
  hubYPercent: number = BOTH_Y.hub,
): { viewBox: string; d: string } {
  const w = Math.max(4, widthPx);
  const h = Math.max(4, heightPx);
  const vbH = (40 * h) / w;
  const s = vbH / 100;
  const yv = (v: number) => v * s;
  const arm = variant === "top" ? BOTH_Y.topArm : BOTH_Y.botArm;
  const hub = Math.max(2, Math.min(98, hubYPercent));
  const d = `M 2 ${yv(arm)} L 20 ${yv(arm)} L 20 ${yv(hub)} L 40 ${yv(hub)}`;
  return { viewBox: `0 0 40 ${vbH}`, d };
}

/** Final → Champion: one horizontal trace at mid-cell height. */
export function bracketConnectorCenterFeederFromSize(widthPx: number, heightPx: number): { viewBox: string; d: string } {
  return bracketConnectorHorizontalAtPercentFromSize(widthPx, heightPx, 50);
}

/** Horizontal trace at a given percentage of cell height (0–100). */
export function bracketConnectorHorizontalAtPercentFromSize(
  widthPx: number,
  heightPx: number,
  yPercent: number,
): { viewBox: string; d: string } {
  const w = Math.max(4, widthPx);
  const h = Math.max(4, heightPx);
  const vbH = (40 * h) / w;
  const s = vbH / 100;
  const yv = (v: number) => v * s;
  const y = Math.max(2, Math.min(98, yPercent));
  const d = `M 2 ${yv(y)} L 38 ${yv(y)}`;
  return { viewBox: `0 0 40 ${vbH}`, d };
}

/** Midpoint Y (0–100) between two vertical centers relative to a gutter cell rect. */
export function bracketConnectorYPercentBetweenCenters(
  cellTop: number,
  cellHeight: number,
  sourceCenterY: number,
  targetCenterY: number,
): number {
  if (cellHeight < 2) return 85;
  const mid = (sourceCenterY + targetCenterY) / 2;
  const pct = ((mid - cellTop) / cellHeight) * 100;
  return Math.max(5, Math.min(95, pct));
}

/** Y (0–100) of one element's vertical center within a gutter cell. */
export function bracketConnectorYPercentForCenter(
  cellTop: number,
  cellHeight: number,
  centerY: number,
): number {
  if (cellHeight < 2) return 50;
  const pct = ((centerY - cellTop) / cellHeight) * 100;
  return Math.max(5, Math.min(95, pct));
}

export const BRACKET_PODIUM_THIRD_SOURCE_ATTR = "data-bracket-podium-third-source";
export const BRACKET_PODIUM_THIRD_TARGET_ATTR = "data-bracket-podium-third-target";
export const BRACKET_PODIUM_CHAMPION_SOURCE_ATTR = "data-bracket-podium-champion-source";
export const BRACKET_PODIUM_CHAMPION_TARGET_ATTR = "data-bracket-podium-champion-target";
export const BRACKET_PODIUM_THIRD_BAND_ATTR = "data-bracket-podium-third-band";

export function bracketConnectorBothForHtmlExport(): { viewBox: string; d: string } {
  return bracketConnectorBothFromSize(BRACKET_CONNECTOR_EXPORT_ASSUMED_W, BRACKET_CONNECTOR_EXPORT_ASSUMED_H);
}

/**
 * Path `d` only at unit aspect (40×100 viewBox height). For measured layout use
 * {@link bracketConnectorSingleFromSize}.
 */
export function bracketConnectorPathD(variant: BracketConnectorVariant): string | null {
  switch (variant) {
    case "both":
      return null;
    case "top":
      return bracketConnectorSingleFromSize(40, 100, "top").d;
    case "bottom":
      return bracketConnectorSingleFromSize(40, 100, "bottom").d;
    case "center":
      return bracketConnectorCenterFeederFromSize(40, 100).d;
    case "none":
      return null;
    default:
      return null;
  }
}

/**
 * Inline script for exported bracket HTML: remeasures each connector cell and rebuilds `viewBox` + `d`
 * so aspect matches the real grid (critical for print/PDF where a fixed 52×480 guess otherwise shears paths).
 */
export function bracketConnectorPaintScriptSource(): string {
  const { topArm, hub, botArm } = BOTH_Y;
  return `(function(){
var Y={t:${topArm},h:${hub},b:${botArm}};
function hubPctForFinalFeed(cell,root){
var m=root&&root.querySelector("[data-bracket-podium-champion-source]");
if(!m||!cell)return Y.h;
var mr=m.getBoundingClientRect(),cr=cell.getBoundingClientRect();
return Math.max(5,Math.min(95,((mr.top+mr.bottom)/2-cr.top)/cr.height*100));
}
function geomBoth(w,h,cell,root){
w=Math.max(4,w);h=Math.max(4,h);
var vbH=(40*h)/w,s=vbH/100;
function yv(v){return v*s}
var hubY=cell&&cell.getAttribute("data-feeds-final-podium")?hubPctForFinalFeed(cell,root):Y.h;
return{vb:"0 0 40 "+vbH,d:"M 2 "+yv(Y.t)+" L 20 "+yv(Y.t)+" L 20 "+yv(hubY)+" L 40 "+yv(hubY)+" M 2 "+yv(Y.b)+" L 20 "+yv(Y.b)+" L 20 "+yv(hubY)};
}
function geomSingle(w,h,k,cell,root){
w=Math.max(4,w);h=Math.max(4,h);
var vbH=(40*h)/w,s=vbH/100;
function yv(v){return v*s}
var arm=k==="top"?Y.t:Y.b;
var hubY=cell&&cell.getAttribute("data-feeds-final-podium")?hubPctForFinalFeed(cell,root):Y.h;
return{vb:"0 0 40 "+vbH,d:"M 2 "+yv(arm)+" L 20 "+yv(arm)+" L 20 "+yv(hubY)+" L 40 "+yv(hubY)};
}
function geomPodiumChampion(wrap){
var cell=wrap.closest(".bracket-html-connector");
if(!cell)cell=wrap.parentElement;
if(!cell)return geomAt(52,480,50);
var cr=cell.getBoundingClientRect();
var w=Math.max(4,cr.width),h=Math.max(4,cr.height);
var root=wrap.closest(".bracket-html-grid")||wrap.closest(".bracket-root");
var src=root&&root.querySelector("[data-bracket-podium-champion-source]");
var tgt=root&&root.querySelector("[data-bracket-podium-champion-target]");
var yPct=50;
if(src&&tgt){
var sr=src.getBoundingClientRect(),tr=tgt.getBoundingClientRect();
var rootEl=wrap.closest(".bracket-root");
var compactSix=!!(rootEl&&rootEl.classList&&rootEl.classList.contains("bracket-root-compact-six-team"));
var mid=compactSix?(sr.top+sr.bottom)/2+56:((sr.top+sr.bottom)/2+(tr.top+tr.bottom)/2)/2;
yPct=((mid-cr.top)/h)*100;
yPct=Math.max(5,Math.min(95,yPct));
}
return geomAt(w,h,yPct);
}
function geomCenter(w,h){
return geomAt(w,h,50);
}
function geomAt(w,h,yPct){
w=Math.max(4,w);h=Math.max(4,h);
var vbH=(40*h)/w,s=vbH/100;
function yv(v){return v*s}
var y=Math.max(2,Math.min(98,yPct));
return{vb:"0 0 40 "+vbH,d:"M 2 "+yv(y)+" L 38 "+yv(y)};
}
function geomLine(w,h,sourcePct,targetPct){
w=Math.max(4,w);h=Math.max(4,h);
var vbH=(40*h)/w,s=vbH/100;
function yv(v){return v*s}
return{vb:"0 0 40 "+vbH,d:"M 2 "+yv(sourcePct)+" L 38 "+yv(targetPct)};
}
function geomPodiumThird(wrap){
var cell=wrap.closest(".bracket-html-connector");
if(!cell)cell=wrap.parentElement;
if(!cell)return geomAt(52,480,85);
var cr=cell.getBoundingClientRect();
var w=Math.max(4,cr.width),h=Math.max(4,cr.height);
var root=wrap.closest(".bracket-html-grid")||wrap.closest(".bracket-root");
var src=root&&root.querySelector("[data-bracket-podium-third-source]");
var tgt=root&&root.querySelector("[data-bracket-podium-third-target]");
var yPct=85;
if(src&&tgt){
var sr=src.getBoundingClientRect(),tr=tgt.getBoundingClientRect();
var sourcePct=(((sr.top+sr.bottom)/2-cr.top)/h)*100;
var targetPct=(((tr.top+tr.bottom)/2-cr.top)/h)*100;
return geomLine(w,h,sourcePct,targetPct);
}
return geomAt(w,h,yPct);
}
function measureWrap(wrap){
var pr=wrap.parentElement&&wrap.parentElement.getBoundingClientRect();
var cr=wrap.getBoundingClientRect();
return{w:Math.max(cr.width,pr?pr.width:0),h:Math.max(cr.height,pr?pr.height:0)};
}
function syncPodiumThirdBands(){
document.querySelectorAll(".bracket-root").forEach(function(root){
var g=root.querySelector("[data-bracket-podium-third-band=\\"game\\"]");
var pl=root.querySelector("[data-bracket-podium-third-band=\\"plaque\\"]");
if(!g||!pl)return;
var h=Math.max(g.getBoundingClientRect().height,pl.getBoundingClientRect().height,0);
if(h>0)root.style.setProperty("--bracket-podium-third-band-sync-height",Math.ceil(h)+"px");
});
}
function alignChampionPlaque(root){
var wrap=root.querySelector(".champion-plaque-wrap");
var match=root.querySelector("[data-bracket-podium-champion-source]");
var plaque=root.querySelector("[data-bracket-podium-champion-target]");
if(!wrap||!match||!plaque){if(wrap)wrap.style.transform="";return;}
var matchCy=(match.getBoundingClientRect().top+match.getBoundingClientRect().bottom)/2;
var plaqueCy=(plaque.getBoundingClientRect().top+plaque.getBoundingClientRect().bottom)/2;
var d=matchCy-plaqueCy;
wrap.style.transform=Math.abs(d)>0.5?"translateY("+d+"px)":"";
}
function fitSlotLabels(root){
root.querySelectorAll(".slot-fit-label").forEach(function(el){
var slot=el.parentElement;
if(!slot)return;
var cs=getComputedStyle(slot);
var pad=parseFloat(cs.paddingLeft)+parseFloat(cs.paddingRight);
var avail=slot.clientWidth-pad;
if(avail<4)return;
var max=parseFloat(cs.fontSize)||13;
var min=Math.min(9,max*0.68);
var size=max;
el.style.fontSize=size+"px";
while(size>min&&el.scrollWidth>avail){
size-=0.5;
el.style.fontSize=size+"px";
}
});
}
function paint(){
syncPodiumThirdBands();
document.querySelectorAll(".bracket-root").forEach(function(root){
alignChampionPlaque(root);
fitSlotLabels(root);
});
document.querySelectorAll("[data-bracket-connector]").forEach(function(wrap){
var mode=wrap.getAttribute("data-bracket-connector");
var svg=wrap.querySelector("svg");
var path=svg&&svg.querySelector("path");
if(!svg||!path||mode==="none")return;
var m=measureWrap(wrap);
if(m.w<2||m.h<2)return;
var cell=wrap.closest(".bracket-html-connector");
var root=wrap.closest(".bracket-html-grid")||wrap.closest(".bracket-root");
var g=mode==="both"?geomBoth(m.w,m.h,cell,root):mode==="center"?geomPodiumChampion(wrap):mode==="podium-third"?geomPodiumThird(wrap):geomSingle(m.w,m.h,mode,cell,root);
svg.setAttribute("viewBox",g.vb);
path.setAttribute("d",g.d);
});
}
function wireResizeObservers(){
if(typeof ResizeObserver==="undefined")return;
document.querySelectorAll("[data-bracket-connector]").forEach(function(wrap){
var outer=wrap.parentElement;
if(!outer||outer._brkConnRO)return;
outer._brkConnRO=true;
var ro=new ResizeObserver(function(){paint();});
ro.observe(outer);
ro.observe(wrap);
});
}
function boot(){
paint();
requestAnimationFrame(function(){paint();});
requestAnimationFrame(function(){requestAnimationFrame(paint);});
setTimeout(paint,0);
setTimeout(paint,80);
setTimeout(paint,400);
wireResizeObservers();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);
else boot();
window.addEventListener("load",paint);
window.addEventListener("resize",paint);
window.addEventListener("beforeprint",paint);
window.addEventListener("afterprint",paint);
})();`;
}
