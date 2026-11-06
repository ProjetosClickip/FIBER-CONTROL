/* Módulo 11 — Equipe e níveis de acesso */
(function (FC) {
  'use strict';
  const U = FC.util, ui = FC.ui, store = FC.store;

  function userForm(u) {
    if (!store.require('equipe.gerenciar')) return;
    const isNew = !u;
    u = u || { id: U.uid('usr_'), role: 'tecnico', ativo: true };
    ui.modal({
      title: isNew ? 'Adicionar membro' : 'Editar membro',
      body: `<form class="form-grid" id="uf">${ui.field('Nome', ui.input('nome', u.nome, 'required'))}${ui.field('E-mail', ui.input('email', u.email, 'type="email" required'))}
        ${ui.field('Nível de acesso', ui.select('role', Object.entries(FC.roles).map(([k, v]) => [k, v.label]), u.role))}${ui.field('Telefone', ui.input('fone', u.fone))}
        ${store.mode === 'local' ? ui.field(isNew ? 'Senha inicial' : 'Nova senha (opcional)', ui.input('senha', '', 'type="password" minlength="6" autocomplete="new-password"'), 'Modo navegador: acesso local a este aparelho') : '<p class="small muted full">Com Supabase, o membro cria a própria senha ao se cadastrar com este e-mail.</p>'}
        <label class="check full"><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Acesso ativo</label></form>`,
      actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Salvar', cls: 'primary', onClick: async (b) => {
        const f = ui.formData(U.$('#uf', b));
        if (!f.nome || !f.email) { ui.toast('Nome e e-mail são obrigatórios.', 'err'); return false; }
        if (store.state.users.some(x => x.id !== u.id && U.norm(x.email) === U.norm(f.email))) { ui.toast('Já existe um membro com este e-mail.', 'err'); return false; }
        if (u.id === store.user().id && f.role !== 'admin' && !store.state.users.some(x => x.id !== u.id && x.role === 'admin' && x.ativo)) { ui.toast('Mantenha ao menos um Administrador ativo.', 'err'); return false; }
        const oldRole = u.role;
        Object.assign(u, { nome: f.nome.trim(), email: f.email.trim(), role: f.role, fone: f.fone, ativo: f.ativo });
        if (f.senha) { if (f.senha.length < 6) { ui.toast('A senha precisa de 6+ caracteres.', 'err'); return false; } u.senha = await U.sha256('fc|' + U.norm(u.email) + '|' + f.senha); }
        store.upsert('users', u, `${isNew ? 'Novo membro' : 'Membro editado'}: ${u.nome}${oldRole && oldRole !== u.role ? ` (perfil ${FC.roles[oldRole].label} → ${FC.roles[u.role].label})` : ''}`);
        FC.rerender();
      } }]
    });
  }

  function render(el) {
    const users = store.state.users;
    const actCount = (u) => store.state.audit.filter(a => a.user === u.nome).length;
    const medCount = (u) => store.state.measurements.filter(m => m.responsavel === u.nome).length;
    const certCount = (u) => store.state.trechos.filter(t => t.certificacao && t.certificacao.aprovador === u.nome && t.certificacao.status === 'certificado').length;
    el.innerHTML = `<div class="page-head"><div class="t"><span class="eyebrow">Pessoas</span><h1>Equipe</h1><p class="muted small">Membros, níveis de acesso e produtividade.</p></div><div class="acts"><button class="btn primary" id="nu">${ui.icon('plus')}Adicionar membro</button></div></div>
      <section class="kpis">${Object.entries(FC.roles).map(([k, r]) => `<div class="kpi"><span class="l">${r.label}</span><span class="v">${users.filter(u => u.role === k && u.ativo).length}</span></div>`).join('')}</section>
      <section class="panel" id="ut"></section>
      <section class="panel"><header><h3>O que cada nível pode fazer</h3><button class="btn sm ghost" id="perm">${ui.icon('gear')}Gerenciar permissões</button></header><div id="pm"></div></section>`;
    U.$('#nu').onclick = () => userForm();
    U.$('#perm').onclick = () => FC.go('configuracoes', { tab: 'permissoes' });
    ui.table(U.$('#ut'), { rows: users, sortKey: 'nome', sortDir: 'asc', onRow: u => userForm(u), columns: [
      { key: 'nome', label: 'Membro', render: u => `<div style="display:flex;gap:10px;align-items:center">${FC.avatar(u)}<div><b>${U.esc(u.nome)}</b>${ui.demo(u)}<br><span class="small muted">${U.esc(u.email || '')}</span></div></div>` },
      { key: 'role', label: 'Nível de acesso', sort: u => FC.roles[u.role].level, render: u => `<span class="tag">${U.esc(FC.roles[u.role].label)}</span>` },
      { key: 'med', label: 'Medições', num: true, sort: medCount, render: medCount }, { key: 'cert', label: 'Certificações', num: true, sort: certCount, render: certCount },
      { key: 'act', label: 'Ações registradas', num: true, sort: actCount, render: actCount },
      { key: 'ativo', label: 'Situação', render: u => u.ativo ? ui.badge('verde', 'Ativo') : ui.badge('sem-dados', 'Inativo') }
    ] });
    const roles = Object.keys(FC.roles);
    U.$('#pm').innerHTML = `<div class="table-scroll"><table class="tbl"><thead><tr><th>Permissão</th>${roles.map(r => `<th>${FC.roles[r].label}</th>`).join('')}</tr></thead><tbody>${Object.keys(FC.permissions).map(p => `<tr><td>${U.esc(FC.permissionLabels[p])}</td>${roles.map(r => `<td>${FC.permissions[p].includes(r) ? '<span class="ok-text">' + ui.icon('check') + '</span>' : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }
  FC.userForm = userForm;
  FC.registerModule({ id: 'equipe', order: 11, title: 'Equipe', icon: 'team', group: 'main', field: false, render });
})(window.FC = window.FC || {});
