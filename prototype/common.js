/* ============================================================
   common.js — 算法训练平台 共享 JavaScript
   所有页面均引用此文件（含 login.html）
   ============================================================ */

/* ----- getUser / getProjectName / logout ----- */
function getUser() {
  try { return JSON.parse(localStorage.getItem('current_user')); } catch(e) { return null; }
}

function logout() {
  localStorage.removeItem('current_user');
  location.href = 'login.html';
}

function getProjectName(key) {
  try {
    var pl = JSON.parse(localStorage.getItem('project_list') || '[]');
    var pp = JSON.parse(localStorage.getItem('personal_projects') || '[]');
    var found = pl.concat(pp).find(function(p) { return p.id === key; });
    if (found) return found.name;
  } catch(e) {}
  var m = { security: '保安服检测', fire: '烟火检测', helmet: '安全帽检测' };
  return m[key] || key;
}

/* ----- Toast ----- */
var _toastTimer;
function showToast(msg) {
  var el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(function() { el.classList.remove('show'); }, 2000);
}

/* ----- User dropdown: click outside to close ----- */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.user-menu')) {
    var dd = document.getElementById('userDropdown');
    if (dd) dd.classList.remove('show');
  }
});

/* ----- Sidebar collapse (handled by inline script in each page) ----- */

/* ----- Task Type ----- */
function getCurrentTaskType() {
  return localStorage.getItem('current_task_type') || 'detection';
}
function onTaskTypeChange(sel) {
  localStorage.setItem('current_task_type', sel.value);
  checkParkAndTask(true);
}

/* ----- Park / Campus ----- */
function onParkChange(sel) {
  localStorage.setItem('current_park', sel.value);
  checkParkAndTask(true);
}
setTimeout(function initHeaderSelectors() {
  var tsel = document.getElementById('headerTaskType');
  if (tsel) {
    var current = localStorage.getItem('current_task_type');
    if (current) tsel.value = current;
  }
  var psel = document.getElementById('headerPark');
  if (psel) {
    var park = localStorage.getItem('current_park');
    if (park) psel.value = park;
  }
  checkParkAndTask();
}, 0);

/* ----- Check if park + task are selected, show prompt if not ----- */
function checkParkAndTask(fromUser) {
  var park = localStorage.getItem('current_park');
  var task = localStorage.getItem('current_task_type');
  var ready = !!(park && task);
  var promptEl = document.getElementById('setupPrompt');
  var sidebarEl = document.querySelector('.sidebar');
  var mainEl = document.querySelector('.content');
  var breadcrumb = document.querySelector('.header .breadcrumb');

  if (!ready) {
    // Not ready: show prompt, hide everything
    if (promptEl) promptEl.style.display = 'flex';
    if (mainEl) mainEl.style.display = 'none';
    if (sidebarEl) {
      sidebarEl.querySelectorAll('.sidebar-group').forEach(function(g) { g.style.display = 'none'; });
    }
    if (breadcrumb) breadcrumb.style.display = 'none';
  } else if (fromUser) {
    // User just made the last selection — reload to apply
    location.reload();
  } else {
    // Init: both already selected, just hide prompt
    if (promptEl) promptEl.style.display = 'none';
  }
  return ready;
}

function toggleSidebar() {
  var s = document.querySelector('.sidebar');
  if (!s) return;
  s.classList.toggle('collapsed');
  try { localStorage.setItem('sidebar_collapsed', s.classList.contains('collapsed')); } catch(e) {}
}
