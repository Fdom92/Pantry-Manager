import { listRowActions } from './list-row-actions.domain';

const actionsOf = (kind: Parameters<typeof listRowActions>[0]) => listRowActions(kind).map(a => a.action);

describe('listRowActions', () => {
  it('lets an automatic suggestion be hidden for now or stop being a staple', () => {
    expect(actionsOf('auto')).toEqual(['hide', 'unbasic']);
  });

  it('lets a manual item be removed, marked destructive', () => {
    expect(listRowActions('manual')).toEqual([{ action: 'remove', destructive: true }]);
  });

  it('lets a bought item go back to the list', () => {
    expect(actionsOf('bought')).toEqual(['restore']);
  });

  it('gives hidden items a way back — they had none before', () => {
    expect(actionsOf('hidden')).toEqual(['unhide', 'unbasic']);
  });

  it('marks nothing but removal as destructive', () => {
    const all = (['auto', 'manual', 'bought', 'hidden'] as const).flatMap(k => listRowActions(k));
    expect(all.filter(a => a.destructive).map(a => a.action)).toEqual(['remove']);
  });
});
