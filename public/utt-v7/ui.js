/* UTT V7 — menu trái không can thiệp Authentication và React state. */
(function () {
  'use strict';
  var INFO1='/utt-info/bo-mon.html';
  var INFO2='/utt-info/nganh-vi-dien-tu.html';
  var PAGE1=location.pathname===INFO1;
  var PAGE2=location.pathname===INFO2;
  
  var scheduled=false;

  function makeIcon(kind){
    var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');
    svg.setAttribute('aria-hidden','true');
    var p=document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',kind==='department'?'M3 10l9-7 9 7M5 10v10M9 10v10M15 10v10M19 10v10M3 21h18M2 10h20':'M8 2v3M16 2v3M8 19v3M16 19v3M2 8h3M19 8h3M2 16h3M19 16h3M6 6h12v12H6zM9 9h6v6H9z');
    svg.appendChild(p);return svg;
  }
  function makeLink(href,label,kind){
    var a=document.createElement('a');a.href=href;a.className='utt-v7-menu__link';
    a.appendChild(makeIcon(kind));var span=document.createElement('span');span.textContent=label;a.appendChild(span);
    if(location.pathname===href)a.setAttribute('aria-current','page');
    a.addEventListener('click',function(){try{sessionStorage.setItem('utt-v7-intro-seen','1');}catch {}});
    return a;
  }
  function sidebarTarget(){
    // Chỉ chèn nếu tìm thấy mục menu gốc rõ ràng, tránh chèn vào nội dung trang.
    var items=document.querySelectorAll('#root a,#root button,#root [role="navigation"] a');
    for(var i=0;i<items.length;i++){
      var el=items[i];
      if((el.textContent||'').trim()==='Lộ trình thực hành') return el;
    }
    return null;
  }
  function placeMenu(){
    // V9: React Sidebar sở hữu menu UTT, bộ chèn DOM V7 phải nhường để khỏi trùng.
    if(document.querySelector('[data-utt-native-menu="true"]')){
      var old=document.getElementById('utt-v7-menu');if(old)old.remove();return true;
    }
    var existing=document.getElementById('utt-v7-menu');
    if(existing && existing.isConnected)return true;
    var anchor=sidebarTarget();if(!anchor)return false;
    // Nút điều hướng gốc có thể có span con; chỉ chọn tổ tiên gần nhất là <a> hoặc <button>.
    if(anchor.tagName!=='A' && anchor.tagName!=='BUTTON')anchor=anchor.closest('a,button');
    if(!anchor||!anchor.parentElement)return false;
    var wrap=document.createElement('div');wrap.id='utt-v7-menu';wrap.className='utt-v7-menu';
    var label=document.createElement('p');label.className='utt-v7-menu__caption';label.textContent='THÔNG TIN UTT';wrap.appendChild(label);
    wrap.appendChild(makeLink(INFO1,'Thông tin bộ môn','department'));
    wrap.appendChild(makeLink(INFO2,'Thông tin ngành','industry'));
    anchor.insertAdjacentElement('afterend',wrap);
    return true;
  }
  function placeHeroBrand(){
    var hero=document.querySelector('.utt-v5-hero');
    if(!hero||hero.querySelector('.utt-v7-hero-brand'))return;
    var b=document.createElement('div');b.className='utt-v7-hero-brand';
    var img=document.createElement('img');img.src='/utt-v5/utt-icon.webp';img.alt='';b.appendChild(img);
    var t=document.createElement('span');t.textContent='LAB THỰC HÀNH';
    var s=document.createElement('small');s.textContent='BỘ MÔN VẬT LÝ CÔNG NGHỆ';t.appendChild(s);b.appendChild(t);hero.insertBefore(b,hero.firstChild);
  }
  function staticInfoSidebar(){
    if(!(PAGE1||PAGE2))return;
    document.body.classList.add('utt-v7-page');
    document.body.classList.toggle('utt-v7-nganh',PAGE2);
    if(document.querySelector('.utt-v7-side'))return;
    var rail=document.createElement('aside');rail.className='utt-v7-side';rail.setAttribute('aria-label','Điều hướng Lab');
    var brand=document.createElement('a');brand.href='/';brand.className='utt-v7-side__brand';brand.appendChild(makeIcon('industry'));
    var text=document.createElement('span');text.textContent='LAB THỰC HÀNH';
    var small=document.createElement('small');small.textContent='BỘ MÔN VẬT LÝ CÔNG NGHỆ';text.appendChild(small);brand.appendChild(text);rail.appendChild(brand);
    var links=document.createElement('nav');links.className='utt-v7-side__links';links.setAttribute('aria-label','Danh mục');
    var all=[['/','Tổng quan','⌂'],[INFO1,'Thông tin bộ môn','⌘'],[INFO2,'Thông tin ngành','⚙']];
    for(var i=0;i<all.length;i++){
      var a=document.createElement('a');a.href=all[i][0];
      if(location.pathname===a.getAttribute('href'))a.setAttribute('aria-current','page');
      var icon=document.createElement('span');icon.textContent=all[i][2];a.appendChild(icon);
      var lbl=document.createElement('span');lbl.textContent=all[i][1];a.appendChild(lbl);
      a.addEventListener('click',function(){try{sessionStorage.setItem('utt-v7-intro-seen','1');}catch {}});
      links.appendChild(a);
    }
    rail.appendChild(links);
    var foot=document.createElement('div');foot.className='utt-v7-side__footer';foot.textContent='Nguồn tham khảo: Trường Đại học Công nghệ Giao thông vận tải';rail.appendChild(foot);
    document.body.insertBefore(rail,document.body.firstChild);
  }
  function flush(){scheduled=false;placeMenu();placeHeroBrand();}
  function queue(){if(scheduled)return;scheduled=true;requestAnimationFrame(flush);}
  function boot(){staticInfoSidebar();queue();var root=document.getElementById('root');if(root){
    // React có thể render lại sidebar sau đăng nhập. Reattach khi DOM thay đổi.
    var obs=new MutationObserver(queue);obs.observe(root,{childList:true,subtree:true});
    window.addEventListener('pagehide',function(){obs.disconnect();});
    window.addEventListener('pageshow',function(event){if(event.persisted){obs.observe(root,{childList:true,subtree:true});queue();}});
  }}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
}());
