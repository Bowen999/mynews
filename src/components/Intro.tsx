const KEY = "mynews-intro";

/**
 * Runs right after the overlay is parsed, before the page is painted. Plays once per tab, when the
 * site is opened from outside (a link inside the app opening a new tab doesn't count), and never for
 * readers who prefer reduced motion or for a tab opened in the background. Waits up to 600 ms for the
 * wordmark font, lets a click or key press skip, and removes the overlay state when it is done.
 */
const introScript = `(function(){
var r=document.documentElement,o=document.getElementById("intro");
try{if(sessionStorage.getItem("${KEY}"))return;sessionStorage.setItem("${KEY}","1")}catch(e){return}
if(!o||document.hidden||matchMedia("(prefers-reduced-motion: reduce)").matches)return;
try{if(document.referrer&&new URL(document.referrer).origin===location.origin)return}catch(e){}
var get=function(){return r.getAttribute("data-intro")},set=function(s){r.setAttribute("data-intro",s)};
var end=function(){r.removeAttribute("data-intro");document.removeEventListener("animationend",onEnd);o.removeEventListener("pointerdown",skip);document.removeEventListener("keydown",skip)};
var onEnd=function(e){if(e.animationName===(get()==="skip"?"intro-skip":"intro-app"))end()};
var skip=function(){if(get()){set("skip");setTimeout(end,400)}};
var play=function(){if(get()==="wait"){set("play");setTimeout(end,2400)}};
set("wait");
document.addEventListener("animationend",onEnd);
o.addEventListener("pointerdown",skip);
document.addEventListener("keydown",skip);
var m=o.querySelector(".intro-mark"),f=m&&getComputedStyle(m).fontFamily;
if(f&&document.fonts&&document.fonts.load)document.fonts.load("700 1em "+f).then(play,play);else play();
setTimeout(play,600);
})();`;

/**
 * The opening animation: the wordmark rises, a rule draws beneath it, then the overlay lifts and
 * the page fades up. Hidden unless the script above sets `data-intro` on <html> (see globals.css).
 */
export function Intro() {
  return (
    <>
      <div id="intro" className="intro" aria-hidden="true">
        <div className="intro-inner">
          <div className="intro-mask">
            <span className="intro-mark">MyNews</span>
          </div>
          <span className="intro-rule" />
          <span className="intro-label">Weekly Intelligence Briefing</span>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: introScript }} />
    </>
  );
}
