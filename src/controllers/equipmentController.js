const equipmentService = require('../services/equipmentService');
const { setFlash } = require('../utils/http');

function catalog(req, res) {
  const filters = { q: req.query.q || '', category: req.query.category || '', status: req.query.status || '' };
  res.render('equipment/catalog', {
    title: 'Equipment catalog',
    items: equipmentService.search(filters),
    categories: equipmentService.listCategories(),
    statuses: equipmentService.STATUSES,
    filters,
  });
}

function detail(req, res) {
  const item = equipmentService.getForDisplay(Number(req.params.id));
  res.render('equipment/detail', { title: item.name, item });
}

function newForm(req, res) {
  res.render('equipment/form', {
    title: 'New equipment',
    item: { name: '', description: '', category: '', serial_number: '', status: 'AVAILABLE' },
    action: '/equipment',
    statuses: equipmentService.EDITABLE_STATUSES,
  });
}

function create(req, res) {
  const item = equipmentService.create(req.user, req.body, req.file);
  setFlash(req, 'success', `Equipment "${item.name}" created.`);
  res.redirect(`/equipment/${item.id}`);
}

function editForm(req, res) {
  const item = equipmentService.getById(Number(req.params.id));
  res.render('equipment/form', {
    title: `Edit ${item.name}`,
    item,
    action: `/equipment/${item.id}`,
    statuses: equipmentService.EDITABLE_STATUSES,
  });
}

function update(req, res) {
  const item = equipmentService.update(req.user, Number(req.params.id), req.body, req.file);
  setFlash(req, 'success', `Equipment "${item.name}" updated.`);
  res.redirect(`/equipment/${item.id}`);
}

function remove(req, res) {
  equipmentService.remove(req.user, Number(req.params.id));
  setFlash(req, 'success', 'Equipment deleted.');
  res.redirect('/equipment');
}

module.exports = { catalog, detail, newForm, create, editForm, update, remove };
