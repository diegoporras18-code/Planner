/* Planner — seguimiento de proyectos. Sin dependencias; datos en localStorage. */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Constantes                                                          */
  /* ------------------------------------------------------------------ */

  var STORE_KEY = 'planner.v1';
  var UI_KEY = 'planner.ui';
  var THEME_KEY = 'planner.theme';

  var PROJECT_STATUSES = [
    { id: 'not_started', label: 'No ha empezado', tone: 'neutral' },
    { id: 'proposal', label: 'En propuesta', tone: 'blue' },
    { id: 'running', label: 'En ejecución', tone: 'amber' },
    { id: 'paused', label: 'En pausa', tone: 'red' },
    { id: 'done', label: 'Listo', tone: 'green' }
  ];

  var TASK_STATUSES = [
    { id: 'pending', label: 'Pendiente', tone: 'neutral' },
    { id: 'progress', label: 'En desarrollo', tone: 'amber' },
    { id: 'done', label: 'Listo', tone: 'green' }
  ];

  var SORTS = [
    { id: 'manual', label: 'Orden manual' },
    { id: 'name', label: 'Nombre (A–Z)' },
    { id: 'client', label: 'Cliente (A–Z)' },
    { id: 'budget', label: 'Presupuesto (mayor)' },
    { id: 'margin', label: 'Margen Fuse (mayor)' },
    { id: 'updated', label: 'Última actualización' }
  ];

  /* ------------------------------------------------------------------ */
  /* Utilidades                                                          */
  /* ------------------------------------------------------------------ */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  var moneyFmt = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 });
  var numFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });
  var dateFmt = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
  var longDateFmt = new Intl.DateTimeFormat('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function money(n) { return n == null ? '' : moneyFmt.format(n); }

  function moneyShort(n) {
    if (n == null) return '';
    var abs = Math.abs(n);
    if (abs >= 1e9) return '$' + numFmt.format(n / 1e9) + ' mil M';
    if (abs >= 1e6) return '$' + numFmt.format(n / 1e6) + ' M';
    return money(n);
  }

  function pct(n) { return n == null ? '' : numFmt.format(n) + '%'; }

  /* Acepta "190000000", "190.000.000", "$190.000.000", "190 millones", "190M", "1,5 mil millones", "500 mil". */
  function parseMoney(raw) {
    var s = String(raw == null ? '' : raw).trim().toLowerCase();
    if (!s) return null;
    var mult = 1;
    if (/mil\s*millones/.test(s)) mult = 1e9;
    else if (/(millones|millón|millon|\d\s*m\b|\d\s*m$)/.test(s)) mult = 1e6;
    else if (/(\bmil\b|\d\s*k\b|\d\s*k$)/.test(s)) mult = 1e3;
    var num = s.replace(/[^\d.,]/g, '');
    if (!num) return null;
    if (num.indexOf(',') !== -1) {
      num = num.replace(/\./g, '').replace(',', '.');
    } else if (mult > 1 && /^\d+\.\d{1,2}$/.test(num)) {
      /* "1.5 millones": punto decimal */
    } else {
      num = num.replace(/\./g, '');
    }
    var v = parseFloat(num);
    if (!isFinite(v) || v < 0) return null;
    return Math.round(v * mult);
  }

  function parsePct(raw) {
    var s = String(raw == null ? '' : raw).trim().replace('%', '').replace(',', '.');
    if (!s) return null;
    var v = parseFloat(s);
    if (!isFinite(v)) return null;
    return Math.min(100, Math.max(0, Math.round(v * 100) / 100));
  }

  function marginOf(p) {
    if (p.budget == null || p.marginPct == null) return null;
    return Math.round(p.budget * p.marginPct / 100);
  }

  function statusById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return list[0];
  }

  function taskCounts(p) {
    var c = { pending: 0, progress: 0, done: 0, total: p.tasks.length };
    p.tasks.forEach(function (t) { c[t.status] = (c[t.status] || 0) + 1; });
    return c;
  }

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  /* ------------------------------------------------------------------ */
  /* Iconos (SVG propios, trazo 1.75)                                    */
  /* ------------------------------------------------------------------ */

  var ICONS = {
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
    board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronRight: '<path d="m9 6 6 6-6 6"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    grip: '<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
    open: '<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    sort: '<path d="M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4"/>',
    layers: '<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 13 9 5 9-5"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    arrowRight: '<path d="M5 12h14M13 6l6 6-6 6"/>'
  };

  function icon(name, cls) {
    return '<svg class="icon ' + (cls || '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  /* ------------------------------------------------------------------ */
  /* Estado                                                              */
  /* ------------------------------------------------------------------ */

  function makeProject(fields) {
    var now = Date.now();
    return {
      id: uid(),
      name: fields.name || '',
      client: fields.client || '',
      status: fields.status || 'not_started',
      budget: fields.budget == null ? null : fields.budget,
      marginPct: fields.marginPct == null ? null : fields.marginPct,
      nextStep: fields.nextStep || '',
      notes: fields.notes || '',
      tasks: (fields.tasks || []).map(function (t) { return makeTask(t.title, t.status); }),
      order: fields.order || 0,
      createdAt: now,
      updatedAt: now
    };
  }

  function makeTask(title, status) {
    return { id: uid(), title: title || '', status: status || 'pending', createdAt: Date.now() };
  }

  function seed() {
    var list = [
      makeProject({
        name: 'Caravanas', client: 'Friko', status: 'running',
        nextStep: 'Ejecutar la última caravana, programada para el 5 de diciembre.',
        tasks: [{ title: 'Ejecutar la última caravana (5 de diciembre)', status: 'progress' }]
      }),
      makeProject({
        name: 'Navidas', client: 'Friko', status: 'proposal', budget: 190000000,
        nextStep: 'Estamos cotizando con los medios para estructurar y presentar la propuesta.',
        tasks: [
          { title: 'Cotizar con los medios', status: 'progress' },
          { title: 'Estructurar y presentar la propuesta', status: 'pending' }
        ]
      }),
      makeProject({
        name: 'LCDLF', client: 'Ringo', status: 'proposal',
        nextStep: 'Reunirnos con el canal para estructurar una propuesta de cara al 2027.',
        tasks: [
          { title: 'Reunión con el canal', status: 'pending' },
          { title: 'Estructurar la propuesta 2027', status: 'pending' }
        ]
      })
    ];
    list.forEach(function (p, i) { p.order = i; });
    return { version: 1, projects: list };
  }

  function validState(s) {
    return s && Array.isArray(s.projects) && s.projects.every(function (p) {
      return p && typeof p.id === 'string' && Array.isArray(p.tasks);
    });
  }

  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var s = JSON.parse(raw);
        if (validState(s)) return s;
      }
    } catch (e) { /* almacenamiento no disponible */ }
    return seed();
  }

  var storageOk = true;
  function save() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      if (storageOk) toast('No se pudo guardar en este navegador. Exporta tus datos para no perderlos.');
      storageOk = false;
    }
  }

  function loadUi() {
    var d = { view: 'board', sort: 'manual', grouped: true, collapsed: {}, statusFilter: 'all' };
    try {
      var raw = localStorage.getItem(UI_KEY);
      if (raw) {
        var u = JSON.parse(raw);
        for (var k in d) if (u && u[k] !== undefined) d[k] = u[k];
      }
    } catch (e) {}
    return d;
  }

  function saveUi() {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify({
        view: ui.view, sort: ui.sort, grouped: ui.grouped, collapsed: ui.collapsed, statusFilter: ui.statusFilter
      }));
    } catch (e) {}
  }

  var state = load();
  var ui = loadUi();
  ui.query = '';
  ui.selectedId = null;
  ui.taskFilter = 'all';
  ui.focusNext = null;

  function getProject(id) {
    for (var i = 0; i < state.projects.length; i++) if (state.projects[i].id === id) return state.projects[i];
    return null;
  }

  function touch(p) { p.updatedAt = Date.now(); }

  function commit() { save(); render(); }

  /* ------------------------------------------------------------------ */
  /* Consultas                                                           */
  /* ------------------------------------------------------------------ */

  function visibleProjects() {
    var q = normalize(ui.query);
    var list = state.projects.filter(function (p) {
      if (ui.statusFilter !== 'all' && p.status !== ui.statusFilter) return false;
      if (!q) return true;
      return normalize(p.name + ' ' + p.client + ' ' + p.nextStep).indexOf(q) !== -1;
    });
    var cmp = {
      manual: function (a, b) { return a.order - b.order; },
      name: function (a, b) { return a.name.localeCompare(b.name, 'es'); },
      client: function (a, b) { return a.client.localeCompare(b.client, 'es') || a.name.localeCompare(b.name, 'es'); },
      budget: function (a, b) { return (b.budget == null ? -1 : b.budget) - (a.budget == null ? -1 : a.budget); },
      margin: function (a, b) { var ma = marginOf(a), mb = marginOf(b); return (mb == null ? -1 : mb) - (ma == null ? -1 : ma); },
      updated: function (a, b) { return b.updatedAt - a.updatedAt; }
    }[ui.sort] || function (a, b) { return a.order - b.order; };
    return list.slice().sort(cmp);
  }

  function totals(list) {
    var t = { count: list.length, budget: 0, margin: 0, budgetKnown: 0, marginKnown: 0, tasks: 0, tasksDone: 0, tasksProgress: 0 };
    list.forEach(function (p) {
      if (p.budget != null) { t.budget += p.budget; t.budgetKnown++; }
      var m = marginOf(p);
      if (m != null) { t.margin += m; t.marginKnown++; }
      var c = taskCounts(p);
      t.tasks += c.total; t.tasksDone += c.done; t.tasksProgress += c.progress;
    });
    return t;
  }

  /* ------------------------------------------------------------------ */
  /* Piezas de interfaz                                                  */
  /* ------------------------------------------------------------------ */

  function statusPill(kind, statusId, attrs) {
    var list = kind === 'task' ? TASK_STATUSES : PROJECT_STATUSES;
    var s = statusById(list, statusId);
    return '<button type="button" class="pill tone-' + s.tone + '" data-action="status-menu" data-kind="' + kind + '" ' + (attrs || '') +
      ' aria-haspopup="menu" aria-label="Estado: ' + esc(s.label) + '. Cambiar estado">' + esc(s.label) + '</button>';
  }

  function taskBar(p, withLabel) {
    var c = taskCounts(p);
    if (!c.total) return '<span class="muted small">Sin tareas</span>';
    var seg = function (n, tone) { return n ? '<span class="seg tone-' + tone + '" style="flex:' + n + '"></span>' : ''; };
    var label = c.done + '/' + c.total + ' listas';
    return '<span class="taskbar" title="' + c.done + ' listas · ' + c.progress + ' en desarrollo · ' + c.pending + ' pendientes">' +
      '<span class="taskbar-track">' + seg(c.done, 'green') + seg(c.progress, 'amber') + seg(c.pending, 'neutral') + '</span>' +
      (withLabel === false ? '' : '<span class="taskbar-label">' + label + '</span>') + '</span>';
  }

  function sidebar() {
    var t = totals(state.projects);
    var q = normalize(ui.query);
    var recent = state.projects.slice().sort(function (a, b) { return a.order - b.order; });
    return '' +
      '<aside class="sidebar">' +
        '<div class="brand"><span class="wordmark">Planner</span><span class="brand-date">' + esc(shortDate()) + '</span></div>' +
        '<nav class="nav" aria-label="Vistas">' +
          navItem('board', 'board', 'Proyectos', t.count) +
          navItem('overview', 'chart', 'Resumen general') +
        '</nav>' +
        '<button type="button" class="btn btn-primary btn-block" data-action="new-project">' + icon('plus') + 'Nuevo proyecto <kbd class="kbd">N</kbd></button>' +
        (t.count ? '<div class="side-pulse">' +
          '<div class="side-pulse-row"><span class="side-pulse-label">Presupuesto</span><span class="side-pulse-value">' + (t.budgetKnown ? esc(moneyShort(t.budget)) : '—') + '</span></div>' +
          '<div class="side-pulse-row"><span class="side-pulse-label">Margen Fuse</span><span class="side-pulse-value">' + (t.marginKnown ? esc(moneyShort(t.margin)) : '—') + '</span></div>' +
          statusDist(state.projects) +
        '</div>' : '') +
        '<div class="side-section">' +
          '<div class="side-heading">Proyectos</div>' +
          '<ul class="side-list">' +
            (recent.length ? recent.map(function (p) {
              var s = statusById(PROJECT_STATUSES, p.status);
              var hit = !q || normalize(p.name + ' ' + p.client).indexOf(q) !== -1;
              return '<li' + (hit ? '' : ' hidden') + '><button type="button" class="side-link' + (ui.selectedId === p.id ? ' is-active' : '') + '" data-action="open-project" data-id="' + p.id + '">' +
                '<span class="dot tone-' + s.tone + '" aria-hidden="true"></span>' +
                '<span class="side-link-text"><span class="truncate">' + esc(p.name || 'Sin nombre') + '</span><span class="side-client truncate">' + esc(p.client || 'Sin cliente') + '</span></span>' +
              '</button></li>';
            }).join('') : '<li class="muted small side-empty">Aún no hay proyectos.</li>') +
          '</ul>' +
        '</div>' +
        '<div class="side-footer">' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="export" title="Descargar una copia de tus datos">' + icon('download') + 'Exportar</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-action="import" title="Cargar datos desde un archivo">' + icon('upload') + 'Importar</button>' +
          '<button type="button" class="btn btn-ghost btn-icon" data-action="theme" aria-label="Cambiar tema claro u oscuro">' + icon(isDark() ? 'sun' : 'moon') + '</button>' +
        '</div>' +
      '</aside>';
  }

  function shortDate() {
    return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(new Date()).replace('.', '');
  }

  function statusDist(list) {
    return '<div class="dist" role="img" aria-label="Proyectos por estado: ' + PROJECT_STATUSES.map(function (s) {
      return s.label + ' ' + list.filter(function (p) { return p.status === s.id; }).length;
    }).join(', ') + '">' + PROJECT_STATUSES.map(function (s) {
      var n = list.filter(function (p) { return p.status === s.id; }).length;
      return n ? '<span class="seg tone-' + s.tone + '" style="flex:' + n + '" title="' + esc(s.label) + ': ' + n + '"></span>' : '';
    }).join('') + '</div>';
  }

  function navItem(view, ic, label, count) {
    return '<button type="button" class="nav-item' + (ui.view === view ? ' is-active' : '') + '" data-action="view" data-view="' + view + '"' + (ui.view === view ? ' aria-current="page"' : '') + '>' +
      icon(ic) + '<span>' + label + '</span>' + (count != null ? '<span class="count">' + count + '</span>' : '') + '</button>';
  }

  /* ---------- Tablero ---------- */

  function boardView() {
    var list = visibleProjects();
    var head = '' +
      '<header class="page-head">' +
        '<div><h1>Proyectos</h1><p class="sub">' + boardSub(list) + '</p></div>' +
        '<button type="button" class="btn btn-primary" data-action="new-project">' + icon('plus') + 'Nuevo proyecto</button>' +
      '</header>' +
      '<div class="toolbar">' +
        '<label class="search">' + icon('search') +
          '<input type="search" data-key="search" data-field="query" placeholder="Buscar proyecto, cliente o próximo paso" value="' + esc(ui.query) + '" aria-label="Buscar proyectos">' +
        '</label>' +
        '<div class="chips" role="group" aria-label="Filtrar por estado">' +
          chip('all', 'Todos') + PROJECT_STATUSES.map(function (s) { return chip(s.id, s.label, s.tone); }).join('') +
        '</div>' +
        '<div class="toolbar-right">' +
          '<label class="select">' + icon('sort') +
            '<select data-field="sort" aria-label="Ordenar">' + SORTS.map(function (s) {
              return '<option value="' + s.id + '"' + (ui.sort === s.id ? ' selected' : '') + '>' + s.label + '</option>';
            }).join('') + '</select>' +
          '</label>' +
          '<button type="button" class="btn btn-ghost btn-sm' + (ui.grouped ? ' is-on' : '') + '" data-action="toggle-group" aria-pressed="' + ui.grouped + '">' + icon('layers') + 'Agrupar por estado</button>' +
        '</div>' +
      '</div>';

    if (!state.projects.length) {
      return head + '<div class="empty">' +
        '<h2>Tu tablero está vacío</h2>' +
        '<p>Crea un proyecto, asígnale un cliente y un presupuesto, y Planner calculará el margen Fuse por ti.</p>' +
        '<button type="button" class="btn btn-primary" data-action="new-project">' + icon('plus') + 'Crear el primer proyecto</button>' +
      '</div>';
    }
    if (!list.length) {
      return head + '<div class="empty"><h2>Sin resultados</h2><p>Ningún proyecto coincide con la búsqueda o el filtro.</p>' +
        '<button type="button" class="btn" data-action="clear-filters">Limpiar filtros</button></div>';
    }

    var body;
    if (ui.grouped) {
      body = PROJECT_STATUSES.map(function (s) {
        var items = list.filter(function (p) { return p.status === s.id; });
        if (!items.length && (ui.query || ui.statusFilter !== 'all')) return '';
        return group(s, items);
      }).join('');
    } else {
      body = group(null, list);
    }
    return head + '<div class="board-scroll"><div class="board">' + colHeader() + body + '</div></div>';
  }

  function boardSub(list) {
    var t = totals(list);
    var parts = [list.length + ' ' + (list.length === 1 ? 'proyecto' : 'proyectos') + (list.length !== state.projects.length ? ' de ' + state.projects.length : '')];
    if (t.budgetKnown) parts.push('<span class="strong">' + money(t.budget) + '</span> en presupuesto');
    if (t.marginKnown) parts.push('<span class="strong">' + money(t.margin) + '</span> de margen Fuse');
    if (!t.budgetKnown) parts.push('Haz clic en cualquier celda para editarla');
    return parts.join(' · ');
  }

  function chip(id, label, tone) {
    var on = ui.statusFilter === id;
    return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-action="filter" data-status="' + id + '" aria-pressed="' + on + '">' +
      (tone ? '<span class="dot tone-' + tone + '" aria-hidden="true"></span>' : '') + label + '</button>';
  }

  function colHeader() {
    return '<div class="row row-head" role="row">' +
      '<span></span><span>Proyecto</span><span>Cliente</span><span>Estado</span><span class="num">Presupuesto</span>' +
      '<span class="num">% Margen</span><span class="num">Margen Fuse</span><span>Tareas</span><span>Próximo paso</span><span></span></div>';
  }

  function group(s, items) {
    var key = s ? s.id : 'all';
    var collapsed = !!ui.collapsed[key];
    var t = totals(items);
    var title = s ? s.label : 'Todos los proyectos';
    var tone = s ? s.tone : 'neutral';
    var out = '<section class="group tone-' + tone + (collapsed ? ' is-collapsed' : '') + '" data-group="' + key + '">' +
      '<button type="button" class="group-head" data-action="collapse" data-group="' + key + '" aria-expanded="' + !collapsed + '">' +
        icon(collapsed ? 'chevronRight' : 'chevronDown', 'chev') +
        '<span class="group-title">' + esc(title) + '</span>' +
        '<span class="group-count">' + items.length + ' ' + (items.length === 1 ? 'proyecto' : 'proyectos') + '</span>' +
        (collapsed && t.budgetKnown ? '<span class="group-mini">' + money(t.budget) + '</span>' : '') +
      '</button>';
    if (!collapsed) {
      out += '<div class="group-body" data-drop-group="' + key + '">' +
        items.map(row).join('') +
        '<div class="row row-add"><span></span><button type="button" class="add-inline" data-action="new-project" data-status="' + (s ? s.id : '') + '">' + icon('plus') + 'Agregar proyecto</button></div>' +
        (items.length ? '<div class="row row-sum" aria-label="Totales del grupo">' +
          '<span></span><span class="muted small">Total</span><span></span><span></span>' +
          '<span class="num strong">' + (t.budgetKnown ? money(t.budget) : '<span class="muted">—</span>') + '</span>' +
          '<span class="num muted small">' + (t.budgetKnown && t.marginKnown ? pct(Math.round(t.margin / t.budget * 1000) / 10) : '') + '</span>' +
          '<span class="num strong">' + (t.marginKnown ? money(t.margin) : '<span class="muted">—</span>') + '</span>' +
          '<span class="muted small">' + (t.tasks ? t.tasksDone + '/' + t.tasks + ' listas' : '') + '</span><span></span><span></span>' +
        '</div>' : '') +
      '</div>';
    }
    return out + '</section>';
  }

  function row(p) {
    var m = marginOf(p);
    var manual = ui.sort === 'manual';
    return '<div class="row row-item' + (ui.selectedId === p.id ? ' is-selected' : '') + '" data-id="' + p.id + '" data-row>' +
      '<span class="cell-grip c-grip">' + (manual ? '<span class="grip" data-grip title="Arrastra para reordenar" aria-hidden="true">' + icon('grip') + '</span>' : '') + '</span>' +
      '<span class="cell-name c-name"><input class="cell-input strong" data-key="name-' + p.id + '" data-field="name" data-id="' + p.id + '" value="' + esc(p.name) + '" placeholder="Nombre del proyecto" aria-label="Nombre del proyecto">' +
        '<button type="button" class="open-btn" data-action="open-project" data-id="' + p.id + '" aria-label="Abrir ' + esc(p.name || 'proyecto') + '">' + icon('open') + '<span>Abrir</span></button></span>' +
      '<span class="c-client" data-label="Cliente"><input class="cell-input" data-key="client-' + p.id + '" data-field="client" data-id="' + p.id + '" value="' + esc(p.client) + '" placeholder="Cliente" aria-label="Cliente" list="client-list"></span>' +
      '<span class="cell-status c-status">' + statusPill('project', p.status, 'data-id="' + p.id + '"') + '</span>' +
      '<span class="num c-budget" data-label="Presupuesto"><input class="cell-input num" data-key="budget-' + p.id + '" data-field="budget" data-id="' + p.id + '" value="' + esc(money(p.budget)) + '" placeholder="Por definir" aria-label="Presupuesto" inputmode="decimal"></span>' +
      '<span class="num c-pct" data-label="% Margen"><input class="cell-input num" data-key="pct-' + p.id + '" data-field="marginPct" data-id="' + p.id + '" value="' + esc(pct(p.marginPct)) + '" placeholder="—" aria-label="Porcentaje de margen" inputmode="decimal"></span>' +
      '<span class="num cell-margin c-margin" data-label="Margen Fuse">' + (m == null ? '<span class="muted">Por definir</span>' : '<span class="strong">' + money(m) + '</span>') + '</span>' +
      '<span class="c-tasks" data-label="Tareas">' + taskBar(p) + '</span>' +
      '<span class="c-next" data-label="Próximo paso"><input class="cell-input" data-key="next-' + p.id + '" data-field="nextStep" data-id="' + p.id + '" value="' + esc(p.nextStep) + '" placeholder="Definir próximo paso" aria-label="Próximo paso" title="' + esc(p.nextStep) + '"></span>' +
      '<span class="cell-actions c-actions"><button type="button" class="btn-icon btn-ghost btn danger-hover" data-action="delete-project" data-id="' + p.id + '" aria-label="Borrar ' + esc(p.name || 'proyecto') + '">' + icon('trash') + '</button></span>' +
    '</div>';
  }

  /* ---------- Resumen general ---------- */

  function overviewView() {
    var all = state.projects;
    var t = totals(all);
    var active = all.filter(function (p) { return p.status === 'running' || p.status === 'proposal'; }).length;
    var avgPct = t.budget && t.marginKnown ? Math.round(t.margin / sumBudgetWithMargin(all) * 1000) / 10 : null;
    var pending = all.length - t.budgetKnown;

    var head = '<header class="page-head"><div><h1>Resumen general</h1><p class="sub cap">' + esc(longDateFmt.format(new Date())) + '</p></div></header>';

    if (!all.length) {
      return head + '<div class="empty"><h2>Nada que resumir todavía</h2><p>Cuando crees proyectos, aquí verás el presupuesto y el margen sumados.</p>' +
        '<button type="button" class="btn btn-primary" data-action="new-project">' + icon('plus') + 'Nuevo proyecto</button></div>';
    }

    var figures = '<div class="figures">' +
      figure('Proyectos', String(all.length), active + ' activos (en propuesta o ejecución)') +
      figure('Presupuesto total', t.budgetKnown ? moneyShort(t.budget) : 'Por definir', t.budgetKnown ? money(t.budget) + (pending ? ' · ' + pending + ' por definir' : '') : 'Ningún proyecto tiene presupuesto') +
      figure('Margen Fuse total', t.marginKnown ? moneyShort(t.margin) : 'Por definir', t.marginKnown ? money(t.margin) + ' · ' + pct(avgPct) + ' promedio' : 'Define presupuesto y % para calcularlo') +
      figure('Tareas listas', t.tasks ? t.tasksDone + ' de ' + t.tasks : '0', t.tasks ? t.tasksProgress + ' en desarrollo · ' + (t.tasks - t.tasksDone - t.tasksProgress) + ' pendientes' : 'Sin tareas creadas') +
    '</div>';

    /* Por estado */
    var byStatus = PROJECT_STATUSES.map(function (s) {
      var items = all.filter(function (p) { return p.status === s.id; });
      return { s: s, items: items, t: totals(items) };
    });
    var dist = statusDist(all);
    var statusTable = '<table class="data"><thead><tr><th>Estado</th><th class="num">Proyectos</th><th class="num">Presupuesto</th><th class="num">Margen Fuse</th></tr></thead><tbody>' +
      byStatus.map(function (g) {
        return '<tr' + (g.items.length ? '' : ' class="is-zero"') + '><td><span class="dot tone-' + g.s.tone + '"></span>' + esc(g.s.label) + '</td>' +
          '<td class="num">' + g.items.length + '</td>' +
          '<td class="num">' + (g.t.budgetKnown ? money(g.t.budget) : '<span class="muted">—</span>') + '</td>' +
          '<td class="num">' + (g.t.marginKnown ? money(g.t.margin) : '<span class="muted">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table>';

    /* Por cliente */
    var clients = {};
    all.forEach(function (p) {
      var k = p.client.trim() || 'Sin cliente';
      (clients[k] = clients[k] || []).push(p);
    });
    var clientRows = Object.keys(clients).sort(function (a, b) { return a.localeCompare(b, 'es'); }).map(function (k) {
      var ct = totals(clients[k]);
      return '<tr><td class="strong">' + esc(k) + '</td><td class="num">' + clients[k].length + '</td>' +
        '<td class="num">' + (ct.budgetKnown ? money(ct.budget) : '<span class="muted">Por definir</span>') + '</td>' +
        '<td class="num">' + (ct.marginKnown ? money(ct.margin) : '<span class="muted">Por definir</span>') + '</td>' +
        '<td class="num">' + (ct.tasks ? ct.tasksDone + '/' + ct.tasks : '<span class="muted">—</span>') + '</td></tr>';
    }).join('');
    var clientTable = '<table class="data"><thead><tr><th>Cliente</th><th class="num">Proyectos</th><th class="num">Presupuesto</th><th class="num">Margen Fuse</th><th class="num">Tareas</th></tr></thead><tbody>' + clientRows +
      '</tbody><tfoot><tr><td>Total</td><td class="num">' + all.length + '</td><td class="num">' + (t.budgetKnown ? money(t.budget) : '—') + '</td><td class="num">' + (t.marginKnown ? money(t.margin) : '—') + '</td><td class="num">' + (t.tasks ? t.tasksDone + '/' + t.tasks : '—') + '</td></tr></tfoot></table>';

    /* Próximos pasos */
    var steps = all.filter(function (p) { return p.status !== 'done'; }).sort(function (a, b) { return a.order - b.order; });
    var stepList = steps.length ? '<ul class="steps">' + steps.map(function (p) {
      var s = statusById(PROJECT_STATUSES, p.status);
      return '<li><button type="button" class="step" data-action="open-project" data-id="' + p.id + '">' +
        '<span class="step-main"><span class="step-title"><span class="strong">' + esc(p.name || 'Sin nombre') + '</span><span class="muted"> · ' + esc(p.client || 'Sin cliente') + '</span></span>' +
        '<span class="step-text">' + (p.nextStep ? esc(p.nextStep) : '<span class="muted">Sin próximo paso definido</span>') + '</span></span>' +
        '<span class="tag tone-' + s.tone + '">' + esc(s.label) + '</span>' + icon('arrowRight', 'step-arrow') +
      '</button></li>';
    }).join('') + '</ul>' : '<p class="muted">Todos los proyectos están listos.</p>';

    return head + figures +
      '<div class="ov-grid">' +
        '<section class="panel"><h2>Por estado</h2>' + dist + statusTable + '</section>' +
        '<section class="panel"><h2>Por cliente</h2>' + clientTable + '</section>' +
        '<section class="panel panel-wide"><h2>Próximos pasos</h2>' + stepList + '</section>' +
      '</div>';
  }

  function sumBudgetWithMargin(list) {
    return list.reduce(function (acc, p) { return acc + (marginOf(p) != null ? p.budget : 0); }, 0) || 1;
  }

  function figure(label, value, note) {
    return '<div class="figure"><div class="figure-label">' + label + '</div><div class="figure-value">' + esc(value) + '</div><div class="figure-note">' + esc(note) + '</div></div>';
  }

  /* ---------- Panel de proyecto ---------- */

  function projectPanel() {
    var p = getProject(ui.selectedId);
    if (!p) return '';
    var m = marginOf(p);
    var c = taskCounts(p);
    var s = statusById(PROJECT_STATUSES, p.status);
    var tasks = p.tasks.filter(function (t) { return ui.taskFilter === 'all' || t.status === ui.taskFilter; });

    var summary = [];
    summary.push('<strong>' + esc(p.name || 'Este proyecto') + '</strong>' + (p.client ? ' de <strong>' + esc(p.client) + '</strong>' : '') + ' ' + ({ not_started: 'aún <strong>no ha empezado</strong>', proposal: 'está <strong>en propuesta</strong>', running: 'está <strong>en ejecución</strong>', paused: 'está <strong>en pausa</strong>', done: 'está <strong>listo</strong>' }[p.status] || '') + '.');
    if (p.budget != null) {
      summary.push('Presupuesto de ' + money(p.budget) + (m != null ? ', con un margen Fuse de ' + money(m) + ' (' + pct(p.marginPct) + ').' : '; el margen está por definir.'));
    } else {
      summary.push('El presupuesto está por definir.');
    }
    summary.push(c.total ? c.done + ' de ' + c.total + ' tareas listas' + (c.progress ? ', ' + c.progress + ' en desarrollo' : '') + '.' : 'Aún no tiene tareas.');

    return '<div class="scrim" data-action="close-panel"></div>' +
      '<aside class="drawer" role="dialog" aria-modal="false" aria-labelledby="panel-name">' +
        '<div class="drawer-top">' +
          '<span class="muted small">Actualizado ' + esc(dateFmt.format(new Date(p.updatedAt))) + '</span>' +
          '<div class="drawer-actions">' +
            '<button type="button" class="btn btn-ghost btn-sm danger-hover" data-action="delete-project" data-id="' + p.id + '">' + icon('trash') + 'Borrar</button>' +
            '<button type="button" class="btn btn-ghost btn-icon" data-action="close-panel" aria-label="Cerrar">' + icon('x') + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="drawer-body">' +
          '<input id="panel-name" class="title-input" data-key="p-name" data-field="name" data-id="' + p.id + '" value="' + esc(p.name) + '" placeholder="Nombre del proyecto" aria-label="Nombre del proyecto">' +
          '<div class="meta-row">' +
            '<label class="meta"><span class="meta-label">Cliente</span><input class="field" data-key="p-client" data-field="client" data-id="' + p.id + '" value="' + esc(p.client) + '" placeholder="Ej. Friko" list="client-list"></label>' +
            '<div class="meta"><span class="meta-label">Estado</span>' + statusPill('project', p.status, 'data-id="' + p.id + '"') + '</div>' +
          '</div>' +

          '<p class="summary">' + summary.join(' ') + '</p>' +

          '<div class="money-grid">' +
            '<label class="money-cell"><span class="meta-label">Presupuesto</span><input class="field num" data-key="p-budget" data-field="budget" data-id="' + p.id + '" value="' + esc(money(p.budget)) + '" placeholder="Por definir" inputmode="decimal"><span class="hint">Ej. 190000000 o 190 millones</span></label>' +
            '<label class="money-cell"><span class="meta-label">% Margen</span><input class="field num" data-key="p-pct" data-field="marginPct" data-id="' + p.id + '" value="' + esc(pct(p.marginPct)) + '" placeholder="Ej. 15%" inputmode="decimal"><span class="hint">Entre 0 y 100</span></label>' +
            '<div class="money-cell money-result"><span class="meta-label">Margen Fuse</span><span class="result-value">' + (m == null ? 'Por definir' : money(m)) + '</span><span class="hint">' + (m == null ? 'Presupuesto × % de margen' : 'Calculado automáticamente') + '</span></div>' +
          '</div>' +

          '<label class="block"><span class="meta-label">Próximo paso</span><textarea class="field" rows="2" data-key="p-next" data-field="nextStep" data-id="' + p.id + '" placeholder="¿Qué sigue en este proyecto?">' + esc(p.nextStep) + '</textarea></label>' +

          '<section class="tasks">' +
            '<div class="tasks-head"><h2>Tareas <span class="muted">' + c.total + '</span></h2>' + (c.total ? taskBar(p) : '') + '</div>' +
            '<form class="task-add" data-form="add-task" data-id="' + p.id + '">' + icon('plus') +
              '<input name="title" data-key="p-newtask" placeholder="Agregar una tarea y presionar Enter" aria-label="Nueva tarea" autocomplete="off">' +
              '<button type="submit" class="btn btn-sm">Agregar</button>' +
            '</form>' +
            (c.total ? '<div class="chips chips-sm" role="group" aria-label="Filtrar tareas">' +
              taskChip('all', 'Todas', c.total) + TASK_STATUSES.map(function (ts) { return taskChip(ts.id, ts.label, c[ts.id], ts.tone); }).join('') +
            '</div>' : '') +
            (c.total ? (tasks.length ? '<ul class="task-list">' + tasks.map(function (t) { return taskRow(p, t); }).join('') + '</ul>'
              : '<p class="muted small task-empty">No hay tareas con este estado.</p>')
              : '<p class="muted small task-empty">Divide el proyecto en tareas y marca cada una como pendiente, en desarrollo o lista.</p>') +
          '</section>' +

          '<label class="block"><span class="meta-label">Notas</span><textarea class="field" rows="3" data-key="p-notes" data-field="notes" data-id="' + p.id + '" placeholder="Contexto, contactos, acuerdos…">' + esc(p.notes) + '</textarea></label>' +
          '<p class="muted small created">Creado el ' + esc(dateFmt.format(new Date(p.createdAt))) + '</p>' +
        '</div>' +
      '</aside>';
  }

  function taskChip(id, label, n, tone) {
    var on = ui.taskFilter === id;
    return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-action="task-filter" data-status="' + id + '" aria-pressed="' + on + '">' +
      (tone ? '<span class="dot tone-' + tone + '" aria-hidden="true"></span>' : '') + label + ' <span class="muted">' + (n || 0) + '</span></button>';
  }

  function taskRow(p, t) {
    return '<li class="task' + (t.status === 'done' ? ' is-done' : '') + '">' +
      '<button type="button" class="task-check" data-action="toggle-task" data-id="' + p.id + '" data-task="' + t.id + '" aria-label="' + (t.status === 'done' ? 'Marcar como pendiente' : 'Marcar como lista') + '">' + (t.status === 'done' ? icon('check') : '') + '</button>' +
      '<input class="cell-input task-title" data-key="t-' + t.id + '" data-field="taskTitle" data-id="' + p.id + '" data-task="' + t.id + '" value="' + esc(t.title) + '" aria-label="Título de la tarea">' +
      statusPill('task', t.status, 'data-id="' + p.id + '" data-task="' + t.id + '"') +
      '<button type="button" class="btn btn-ghost btn-icon danger-hover" data-action="delete-task" data-id="' + p.id + '" data-task="' + t.id + '" aria-label="Borrar tarea">' + icon('trash') + '</button>' +
    '</li>';
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  var appEl = document.getElementById('app');

  function render() {
    var active = document.activeElement;
    var key = active && active.dataset ? active.dataset.key : null;
    var selStart = null, selEnd = null;
    try { if (key) { selStart = active.selectionStart; selEnd = active.selectionEnd; } } catch (e) {}
    var drawerBody = appEl.querySelector('.drawer-body');
    var drawerScroll = drawerBody ? drawerBody.scrollTop : 0;
    var boardScroll = appEl.querySelector('.main');
    var mainScroll = boardScroll ? boardScroll.scrollTop : 0;

    var clients = Array.from(new Set(state.projects.map(function (p) { return p.client.trim(); }).filter(Boolean))).sort();

    appEl.innerHTML = sidebar() +
      '<main class="main">' + (ui.view === 'overview' ? overviewView() : boardView()) + '</main>' +
      projectPanel() +
      '<datalist id="client-list">' + clients.map(function (c) { return '<option value="' + esc(c) + '">'; }).join('') + '</datalist>';

    appEl.classList.toggle('has-panel', !!ui.selectedId);

    var nb = appEl.querySelector('.drawer-body');
    if (nb) nb.scrollTop = drawerScroll;
    var nm = appEl.querySelector('.main');
    if (nm) nm.scrollTop = mainScroll;

    var focusKey = ui.focusNext || key;
    ui.focusNext = null;
    if (focusKey) {
      var el = appEl.querySelector('[data-key="' + focusKey + '"]');
      if (el) {
        el.focus({ preventScroll: true });
        if (key === focusKey && selStart != null) { try { el.setSelectionRange(selStart, selEnd); } catch (e) {} }
        else if (el.select && focusKey.indexOf('name') !== -1) el.select();
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Acciones                                                            */
  /* ------------------------------------------------------------------ */

  function newProject(status) {
    var minOrder = state.projects.reduce(function (a, p) { return Math.min(a, p.order); }, 0);
    var p = makeProject({ status: status || (ui.statusFilter !== 'all' ? ui.statusFilter : 'not_started') });
    p.order = status ? maxOrder() + 1 : minOrder - 1;
    state.projects.push(p);
    ui.query = '';
    if (ui.view !== 'board') ui.view = 'board';
    ui.collapsed[ui.grouped ? p.status : 'all'] = false;
    ui.selectedId = p.id;
    ui.taskFilter = 'all';
    ui.focusNext = 'p-name';
    saveUi();
    commit();
  }

  function maxOrder() { return state.projects.reduce(function (a, p) { return Math.max(a, p.order); }, 0); }

  var lastDeleted = null;
  function deleteProject(id) {
    var idx = state.projects.findIndex(function (p) { return p.id === id; });
    if (idx === -1) return;
    var p = state.projects[idx];
    state.projects.splice(idx, 1);
    lastDeleted = { type: 'project', item: p };
    if (ui.selectedId === id) ui.selectedId = null;
    commit();
    toast('Proyecto «' + (p.name || 'Sin nombre') + '» borrado.', 'Deshacer', function () {
      state.projects.push(lastDeleted.item);
      commit();
    });
  }

  function deleteTask(pid, tid) {
    var p = getProject(pid);
    if (!p) return;
    var idx = p.tasks.findIndex(function (t) { return t.id === tid; });
    if (idx === -1) return;
    var t = p.tasks.splice(idx, 1)[0];
    touch(p);
    commit();
    toast('Tarea borrada.', 'Deshacer', function () {
      var pp = getProject(pid);
      if (!pp) return;
      pp.tasks.splice(Math.min(idx, pp.tasks.length), 0, t);
      touch(pp);
      commit();
    });
  }

  function setField(el) {
    var id = el.dataset.id;
    var field = el.dataset.field;
    var p = getProject(id);
    if (!p) return;
    var v = el.value;
    if (field === 'budget') {
      var parsed = parseMoney(v);
      if (v.trim() && parsed == null) { toast('No entendí ese presupuesto. Escribe un número, por ejemplo 190000000 o 190 millones.'); render(); return; }
      if (parsed === p.budget) { el.value = money(p.budget); return; }
      p.budget = parsed;
    } else if (field === 'marginPct') {
      var pc = parsePct(v);
      if (v.trim() && pc == null) { toast('El margen debe ser un número entre 0 y 100.'); render(); return; }
      if (pc === p.marginPct) { el.value = pct(p.marginPct); return; }
      p.marginPct = pc;
    } else if (field === 'taskTitle') {
      var t = p.tasks.find(function (x) { return x.id === el.dataset.task; });
      if (!t) return;
      var title = v.trim();
      if (!title) { el.value = t.title; return; }
      if (title === t.title) return;
      t.title = title;
    } else {
      var nv = field === 'notes' || field === 'nextStep' ? v : v.trim();
      if (nv === p[field]) return;
      p[field] = nv;
    }
    touch(p);
    save();
    /* Render diferido: deja que el foco llegue al siguiente campo antes de redibujar */
    setTimeout(render, 0);
  }

  function setStatus(kind, pid, tid, statusId) {
    var p = getProject(pid);
    if (!p) return;
    if (kind === 'task') {
      var t = p.tasks.find(function (x) { return x.id === tid; });
      if (!t || t.status === statusId) return;
      t.status = statusId;
    } else {
      if (p.status === statusId) return;
      p.status = statusId;
    }
    touch(p);
    commit();
  }

  /* Exportar / importar */

  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'planner-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    toast('Copia descargada.');
  }

  document.getElementById('import-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var s = JSON.parse(reader.result);
        if (!validState(s)) throw new Error('formato');
        var prev = state;
        state = s;
        ui.selectedId = null;
        commit();
        toast(s.projects.length + ' proyectos importados.', 'Deshacer', function () { state = prev; commit(); });
      } catch (err) {
        toast('Ese archivo no es una exportación válida de Planner.');
      }
    };
    reader.readAsText(file);
  });

  /* Tema */

  function isDark() {
    var t = document.documentElement.dataset.theme;
    if (t) return t === 'dark';
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function toggleTheme() {
    var next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem(THEME_KEY, next); } catch (e) {}
    render();
  }

  /* ------------------------------------------------------------------ */
  /* Popover de estados                                                  */
  /* ------------------------------------------------------------------ */

  var popRoot = document.getElementById('popover-root');
  var popAnchor = null;

  function openStatusMenu(btn) {
    closeMenu();
    var kind = btn.dataset.kind;
    var list = kind === 'task' ? TASK_STATUSES : PROJECT_STATUSES;
    var pid = btn.dataset.id, tid = btn.dataset.task;
    var p = getProject(pid);
    var current = kind === 'task' ? (p.tasks.find(function (t) { return t.id === tid; }) || {}).status : p.status;
    popRoot.innerHTML = '<div class="menu" role="menu">' + list.map(function (s) {
      return '<button type="button" role="menuitemradio" aria-checked="' + (s.id === current) + '" class="menu-item" data-status="' + s.id + '">' +
        '<span class="pill pill-static tone-' + s.tone + '">' + esc(s.label) + '</span>' + (s.id === current ? icon('check', 'menu-check') : '<span class="menu-check-space"></span>') + '</button>';
    }).join('') + '</div>';
    var menu = popRoot.firstChild;
    var r = btn.getBoundingClientRect();
    var mw = Math.max(r.width, 190);
    menu.style.minWidth = mw + 'px';
    var left = Math.min(r.left, window.innerWidth - mw - 12);
    var top = r.bottom + 6;
    var mh = menu.offsetHeight;
    if (top + mh > window.innerHeight - 12) top = Math.max(12, r.top - mh - 6);
    menu.style.left = Math.max(12, left) + 'px';
    menu.style.top = top + 'px';
    popAnchor = btn;
    btn.setAttribute('aria-expanded', 'true');
    var focusEl = menu.querySelector('[aria-checked="true"]') || menu.querySelector('.menu-item');
    focusEl.focus();

    menu.addEventListener('click', function (e) {
      var it = e.target.closest('.menu-item');
      if (!it) return;
      closeMenu();
      setStatus(kind, pid, tid, it.dataset.status);
    });
    menu.addEventListener('keydown', function (e) {
      var items = Array.from(menu.querySelectorAll('.menu-item'));
      var i = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); var a = popAnchor; closeMenu(); if (a) a.focus(); }
      else if (e.key === 'Tab') { closeMenu(); }
    });
  }

  function closeMenu() {
    if (popAnchor) popAnchor.removeAttribute('aria-expanded');
    popAnchor = null;
    popRoot.innerHTML = '';
  }

  document.addEventListener('mousedown', function (e) {
    if (popRoot.firstChild && !popRoot.contains(e.target) && !(popAnchor && popAnchor.contains(e.target))) closeMenu();
  });
  window.addEventListener('resize', closeMenu);
  document.addEventListener('scroll', function (e) { if (popRoot.firstChild && !popRoot.contains(e.target)) closeMenu(); }, true);

  /* ------------------------------------------------------------------ */
  /* Toast                                                               */
  /* ------------------------------------------------------------------ */

  var toastRoot = document.getElementById('toast-root');
  var toastTimer = null;

  function toast(msg, actionLabel, onAction) {
    clearTimeout(toastTimer);
    toastRoot.innerHTML = '<div class="toast" role="status"><span>' + esc(msg) + '</span>' +
      (actionLabel ? '<button type="button" class="toast-action">' + esc(actionLabel) + '</button>' : '') +
      '<button type="button" class="toast-close" aria-label="Cerrar aviso">' + icon('x') + '</button></div>';
    var el = toastRoot.firstChild;
    if (actionLabel) el.querySelector('.toast-action').addEventListener('click', function () { hideToast(); onAction(); });
    el.querySelector('.toast-close').addEventListener('click', hideToast);
    toastTimer = setTimeout(hideToast, actionLabel ? 7000 : 4000);
  }

  function hideToast() { clearTimeout(toastTimer); toastRoot.innerHTML = ''; }

  /* ------------------------------------------------------------------ */
  /* Eventos                                                             */
  /* ------------------------------------------------------------------ */

  appEl.addEventListener('click', function (e) {
    var a = e.target.closest('[data-action]');
    if (!a) {
      /* clic en una fila (fuera de controles) abre el proyecto */
      var r = e.target.closest('[data-row]');
      if (r && !e.target.closest('input,button,select,textarea,a')) openProject(r.dataset.id);
      return;
    }
    var act = a.dataset.action;
    switch (act) {
      case 'view': ui.view = a.dataset.view; saveUi(); render(); appEl.querySelector('.main').scrollTop = 0; break;
      case 'new-project': newProject(a.dataset.status || null); break;
      case 'open-project': openProject(a.dataset.id); break;
      case 'close-panel': closePanel(); break;
      case 'delete-project': deleteProject(a.dataset.id); break;
      case 'status-menu': if (popAnchor === a) closeMenu(); else openStatusMenu(a); break;
      case 'filter': ui.statusFilter = a.dataset.status; saveUi(); render(); break;
      case 'clear-filters': ui.statusFilter = 'all'; ui.query = ''; saveUi(); render(); break;
      case 'toggle-group': ui.grouped = !ui.grouped; saveUi(); render(); break;
      case 'collapse': ui.collapsed[a.dataset.group] = !ui.collapsed[a.dataset.group]; saveUi(); render(); break;
      case 'task-filter': ui.taskFilter = a.dataset.status; render(); break;
      case 'toggle-task': {
        var p = getProject(a.dataset.id);
        var t = p && p.tasks.find(function (x) { return x.id === a.dataset.task; });
        if (t) setStatus('task', p.id, t.id, t.status === 'done' ? 'pending' : 'done');
        break;
      }
      case 'delete-task': deleteTask(a.dataset.id, a.dataset.task); break;
      case 'export': exportData(); break;
      case 'import': document.getElementById('import-file').click(); break;
      case 'theme': toggleTheme(); break;
    }
  });

  function openProject(id) {
    if (ui.selectedId === id) return;
    ui.selectedId = id;
    ui.taskFilter = 'all';
    render();
    var d = appEl.querySelector('.drawer-body');
    if (d) d.scrollTop = 0;
    var close = appEl.querySelector('.drawer [data-action="close-panel"].btn-icon');
    if (close && !ui.focusNext) close.focus({ preventScroll: true });
  }

  function closePanel() {
    var id = ui.selectedId;
    ui.selectedId = null;
    render();
    var back = appEl.querySelector('.open-btn[data-id="' + id + '"]');
    if (back) back.focus({ preventScroll: true });
  }

  appEl.addEventListener('change', function (e) {
    var el = e.target;
    if (el.dataset.field === 'sort') { ui.sort = el.value; saveUi(); render(); return; }
    if (el.dataset.field === 'query') return;
    if (el.dataset.id && el.dataset.field) setField(el);
  });

  appEl.addEventListener('input', function (e) {
    var el = e.target;
    if (el.dataset.field === 'query') { ui.query = el.value; render(); }
  });

  appEl.addEventListener('keydown', function (e) {
    var el = e.target;
    if (e.key === 'Enter' && el.matches('input.cell-input, input.field, input.title-input')) {
      e.preventDefault();
      el.blur();
    } else if (e.key === 'Escape' && el.matches('input.cell-input, input.field, input.title-input, textarea')) {
      /* Revertir edición en curso */
      var p = getProject(el.dataset.id);
      if (p && el.dataset.field !== 'query') {
        e.stopPropagation();
        var f = el.dataset.field;
        if (f === 'budget') el.value = money(p.budget);
        else if (f === 'marginPct') el.value = pct(p.marginPct);
        else if (f === 'taskTitle') { var t = p.tasks.find(function (x) { return x.id === el.dataset.task; }); el.value = t ? t.title : ''; }
        else el.value = p[f] || '';
        el.blur();
      }
    }
  });

  appEl.addEventListener('focusin', function (e) {
    var el = e.target;
    /* Al editar dinero, mostrar el número sin formato para escribir cómodo */
    if (el.dataset.field === 'budget') {
      var p = getProject(el.dataset.id);
      if (p && p.budget != null) el.value = String(p.budget);
    } else if (el.dataset.field === 'marginPct') {
      var q = getProject(el.dataset.id);
      if (q && q.marginPct != null) el.value = String(q.marginPct).replace('.', ',');
    }
  });

  appEl.addEventListener('focusout', function (e) {
    var el = e.target;
    if ((el.dataset.field === 'budget' || el.dataset.field === 'marginPct')) {
      var p = getProject(el.dataset.id);
      /* si no hubo cambio, restaurar formato */
      setTimeout(function () {
        if (!document.body.contains(el) || document.activeElement === el || !p) return;
        if (el.dataset.field === 'budget' && parseMoney(el.value) === p.budget) el.value = money(p.budget);
        if (el.dataset.field === 'marginPct' && parsePct(el.value) === p.marginPct) el.value = pct(p.marginPct);
      }, 0);
    }
  });

  appEl.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.dataset.form !== 'add-task') return;
    e.preventDefault();
    var input = form.elements.title;
    var title = input.value.trim();
    if (!title) { input.focus(); return; }
    var p = getProject(form.dataset.id);
    if (!p) return;
    p.tasks.push(makeTask(title, 'pending'));
    touch(p);
    if (ui.taskFilter !== 'all' && ui.taskFilter !== 'pending') ui.taskFilter = 'all';
    ui.focusNext = 'p-newtask';
    commit();
  });

  document.addEventListener('keydown', function (e) {
    var typing = e.target.closest && e.target.closest('input,textarea,select,[contenteditable]');
    if (e.key === 'Escape' && !popRoot.firstChild && ui.selectedId && !typing) { closePanel(); }
    else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); newProject(null); }
      else if (e.key === '/') { var s = appEl.querySelector('[data-key="search"]'); if (s) { e.preventDefault(); s.focus(); } }
    }
  });

  /* ------------------------------------------------------------------ */
  /* Arrastrar para reordenar                                            */
  /* ------------------------------------------------------------------ */

  var dragId = null;

  appEl.addEventListener('mousedown', function (e) {
    var g = e.target.closest('[data-grip]');
    if (g) { var r = g.closest('[data-row]'); if (r) r.setAttribute('draggable', 'true'); }
  });
  appEl.addEventListener('mouseup', function () {
    appEl.querySelectorAll('[draggable="true"]').forEach(function (r) { r.removeAttribute('draggable'); });
  });

  appEl.addEventListener('dragstart', function (e) {
    var r = e.target.closest('[data-row]');
    if (!r) return;
    dragId = r.dataset.id;
    r.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
  });

  appEl.addEventListener('dragover', function (e) {
    if (!dragId) return;
    var r = e.target.closest('[data-row]');
    var gBody = e.target.closest('[data-drop-group]');
    if (!r && !gBody) return;
    e.preventDefault();
    clearDropMarks();
    if (r && r.dataset.id !== dragId) {
      var rect = r.getBoundingClientRect();
      r.classList.add(e.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
    } else if (!r && gBody) {
      gBody.classList.add('drop-into');
    }
  });

  appEl.addEventListener('drop', function (e) {
    if (!dragId) return;
    e.preventDefault();
    var r = e.target.closest('[data-row]');
    var gBody = e.target.closest('[data-drop-group]');
    var moving = getProject(dragId);
    if (!moving) return endDrag();
    var ordered = state.projects.slice().sort(function (a, b) { return a.order - b.order; }).filter(function (p) { return p.id !== dragId; });
    var targetGroup = gBody ? gBody.dataset.dropGroup : null;
    if (r && r.dataset.id !== dragId) {
      var target = getProject(r.dataset.id);
      var rect = r.getBoundingClientRect();
      var after = e.clientY >= rect.top + rect.height / 2;
      var idx = ordered.indexOf(target) + (after ? 1 : 0);
      ordered.splice(idx, 0, moving);
    } else {
      ordered.push(moving);
    }
    ordered.forEach(function (p, i) { p.order = i; });
    if (ui.grouped && targetGroup && targetGroup !== 'all' && moving.status !== targetGroup) {
      moving.status = targetGroup;
      var s = statusById(PROJECT_STATUSES, targetGroup);
      toast('«' + (moving.name || 'Sin nombre') + '» pasó a ' + s.label + '.');
    }
    touch(moving);
    endDrag();
    commit();
  });

  appEl.addEventListener('dragend', endDrag);

  function clearDropMarks() {
    appEl.querySelectorAll('.drop-before,.drop-after,.drop-into').forEach(function (n) { n.classList.remove('drop-before', 'drop-after', 'drop-into'); });
  }
  function endDrag() {
    dragId = null;
    clearDropMarks();
    appEl.querySelectorAll('.is-dragging').forEach(function (n) { n.classList.remove('is-dragging'); });
    appEl.querySelectorAll('[draggable="true"]').forEach(function (n) { n.removeAttribute('draggable'); });
  }

  /* Sincronizar entre pestañas */
  window.addEventListener('storage', function (e) {
    if (e.key === STORE_KEY && e.newValue) {
      try { var s = JSON.parse(e.newValue); if (validState(s)) { state = s; if (ui.selectedId && !getProject(ui.selectedId)) ui.selectedId = null; render(); } } catch (err) {}
    }
  });

  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', function () { if (!document.documentElement.dataset.theme) render(); });
  }

  save();
  render();
})();
