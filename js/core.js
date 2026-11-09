// Shared registry: actions, change handlers, live tickers, navigation.
export const ACT = {}, CHG = {}, TICK = {};
export const reg = (name, fn) => { ACT[name] = fn; };
export const regChg = (name, fn) => { CHG[name] = fn; };
export const regTick = (name, fn) => { TICK[name] = fn; };

export const nav = {
  tab: 'quests',
  sub: { food: 'today', train: 'main' },
  foodDate: null,
  render: () => {},
};
export const rerender = () => nav.render();
export function go(tab) {
  nav.tab = tab;
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  rerender();
  window.scrollTo(0, 0);
}
