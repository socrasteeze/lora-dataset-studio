import { passScopeStatuses } from '../bank/bankPassScope.js';

/** Dataset counts use the same shape and scope definitions as Bank. */
export function datasetFramingScope(images, selectedIds = [], scope = '') {
  const all = { keep: 0, pending: 0, reject: 0 };
  const todo = { ...all };
  const selected = new Set(selectedIds);
  const imageIds = [];
  for (const image of images || []) {
    if (!image?.filename || !Object.hasOwn(all, image.status)) continue;
    all[image.status] += 1;
    if (image.framing == null) todo[image.status] += 1;
    if (selected.has(image.id) && image.status !== 'reject') imageIds.push(image.id);
  }
  return {
    payload: { pass_scopes: { framing: { all, todo } } },
    statuses: passScopeStatuses(scope),
    imageIds,
  };
}
