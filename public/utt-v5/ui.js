/* UTT Lab V5 - JavaScript độc lập. Không truy cập Firebase, AuthState hay React internals. */
(function () {
  'use strict';

  if (window.__uttV5Started) return;
  window.__uttV5Started = true;

  var INTRO_MS = 4000;
  
  var ROUTE_KEY = 'utt.v5.lastPracticeRoute';
  var introStart = Date.now();
  var lastRoute = '';
  var heroScheduled = false;
  

  
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch { return false; }
  }
  
  function isSafeInternalPath(path) {
    return typeof path === 'string' && /^\/(?!\/)[\w\-/%.?=&#+]*$/.test(path)
      && !path.startsWith('/login') && !path.startsWith('/logout');
  }
  
  function finishIntro() {
    var intro = document.getElementById('utt-v5-intro');
    if (!intro) return;
    // V9: chỉ hiển thị 4s ở lượt mở đầu tiên; các lần quay về phải bỏ qua ngay.
    if (document.documentElement.classList.contains('utt-v9-returning')) { intro.remove(); return; }
    var remain = INTRO_MS - (Date.now() - introStart);
    if (remain > 0) { window.setTimeout(finishIntro, remain); return; }
    intro.classList.add('utt-v5-leaving');
    window.setTimeout(function () { if (intro.parentNode) intro.parentNode.removeChild(intro); }, 380);
  }

  function findHeroTitle() {
    if(document.querySelector('[data-labvirt-premium]'))return null;
    var els = document.querySelectorAll('#root h1, #root h2, #root h3');
    for (var i = 0; i < els.length; i++) {
      if (els[i].textContent.trim() === 'Phòng thí nghiệm ảo 3D') return els[i];
    }
    return null;
  }
  function applyHero() {
    var title = findHeroTitle();
    if (!title) return false;
    var current = title;
    var candidate = null;
    for (var i = 0; i < 8 && current; i++, current = current.parentElement) {
      var t = current.textContent || '';
      if (t.includes('Khám phá bài thí nghiệm') && t.includes('Phòng thí nghiệm ảo 3D')) {
        candidate = current;
        break;
      }
    }
    if (!candidate || candidate.classList.contains('utt-v5-hero')) return Boolean(candidate);
    var image = candidate.querySelector('img[src*="utt"],img[src*="campus"],img[src*="lab-hero"]');
    if (image && image.parentElement && image.parentElement.textContent.trim().length < 20) {
      image.parentElement.classList.add('utt-v5-original-banner');
    }
    candidate.classList.add('utt-v5-hero');
    candidate.setAttribute('data-utt-v5-hero', 'true');
    return true;
  }
  function scheduleHero() {
    if (heroScheduled) return;
    heroScheduled = true;
    window.requestAnimationFrame(function () { heroScheduled = false; applyHero(); });
  }

  
  function updateRoute() {
    var path = location.pathname + location.search;
    if (path === lastRoute) return;
    lastRoute = path;
    var pathname = location.pathname;
    var isPractice = /^\/(?:lab|labs|practice|my-practice|experiment|experiments|thi-nghiem|thuc-hanh)(?:\/|$)/i.test(pathname);
    if (isPractice && isSafeInternalPath(path)) {
      saveJSON(ROUTE_KEY, { path: path, visitedAt: Date.now() });
    }
  }

  
  function boot() {
    var oldTools = document.getElementById('utt-v5-tools'); if (oldTools) oldTools.remove();
    updateRoute();
    scheduleHero();
    var root=document.getElementById('root');
    var observer=null;
    if (root && typeof MutationObserver !== 'undefined') {
      observer=new MutationObserver(scheduleHero);observer.observe(root,{childList:true,subtree:true});
    }
    var routeTimer=window.setInterval(updateRoute,1200);
    window.addEventListener('pagehide',function(){observer?.disconnect();clearInterval(routeTimer);routeTimer=0;});
    window.addEventListener('pageshow',function(event){if(event.persisted&&!routeTimer){observer?.observe(root,{childList:true,subtree:true});routeTimer=window.setInterval(updateRoute,1200);updateRoute();scheduleHero();}});
    finishIntro();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});
  else boot();
})();
