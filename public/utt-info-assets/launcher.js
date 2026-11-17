(function () {
  'use strict';
  if (document.getElementById('utt-info-launcher')) return;
  var root = document.createElement('aside');
  root.id = 'utt-info-launcher';
  root.setAttribute('aria-label', 'Thông tin UTT');
  var details = document.createElement('details');
  var summary = document.createElement('summary');
  summary.textContent = 'ⓘ Thông tin UTT';
  var menu = document.createElement('div');
  menu.className = 'utt-info-menu';
  var link1 = document.createElement('a');
  link1.href = '/utt-info/bo-mon.html';
  link1.textContent = '🏛 Lịch sử và thông tin bộ môn';
  var link2 = document.createElement('a');
  link2.href = '/utt-info/nganh-vi-dien-tu.html';
  link2.textContent = '⚛ Kỹ thuật vi điện tử & bán dẫn';
  var note = document.createElement('small');
  note.textContent = 'Thông tin dẫn nguồn chính thức UTT';
  menu.append(link1, link2, note);
  details.append(summary, menu);
  root.appendChild(details);
  document.body.appendChild(root);
  document.addEventListener('click', function (event) {
    if (details.open && event.target instanceof Node && !root.contains(event.target)) details.open = false;
  });
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') details.open = false;
  });
}());
