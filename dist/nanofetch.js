import { atom as V, onStart as D, onStop as U } from "nanostores";
const A = ({
  cache: r = /* @__PURE__ */ new Map(),
  fetcher: d,
  ...o
} = {}) => {
  const g = /* @__PURE__ */ new Set(), S = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), w = /* @__PURE__ */ new Set();
  let O = {};
  const F = async ([e, c], l, t) => {
    const {
      dedupeTime: i = 4e3,
      fetcher: p,
      refetchOnFocus: a,
      refetchOnReconnect: u,
      refetchInterval: _
    } = { ...t, ...O }, f = R();
    a && g.add(e), u && S.add(e), _ && !n.has(e) && n.set(
      e,
      window.setInterval(
        () => F([e, c], l, t),
        _
      )
    );
    const v = s.get(e);
    v && v + i > f || w.has(e) || (s.set(e, f), w.add(e), c || console.log(new Error()), p(...c).then((m) => {
      const h = { data: m, loading: !1 };
      r.set(e, h), l.set(h), s.set(e, R());
    }).catch((m) => l.set({ error: m, loading: !1 })).finally(() => w.delete(e)));
  }, E = (e) => {
    !e || (g.delete(e), S.delete(e), clearInterval(n.get(e)));
  }, K = ([e, c], l, t) => {
    if (!r.has(e)) {
      const i = { loading: !0 };
      r.set(e, i);
    }
    T(() => l.set(r.get(e))), F([e, c], l, t);
  };
  return [
    (e, {
      fetcher: c = d,
      ...l
    } = {}) => {
      if (process.env.NODE_ENV !== "production" && !c)
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      const t = V({ loading: !0 }), i = { ...o, ...l, fetcher: c };
      let p, a, u, _, f;
      D(t, () => {
        const h = !p;
        [f, p] = L(e), _ = f.listen((I) => {
          if (I) {
            const [M, b] = I;
            E(a), K([M, b], t, i), a = M, u = b;
          }
        });
        const N = f.get();
        N ? ([a, u] = N, h && v()) : T(() => t.set({ loading: !0 }));
      });
      const v = () => {
        a && u && K(
          [a, u],
          t,
          i
        );
      }, m = t.listen;
      return t.listen = (h) => (v(), m(h)), U(t, () => {
        p(), _(), E(a);
      }), t;
    },
    (e) => {
    },
    (e) => {
      process.env.NODE_ENV !== "test" && console.warn(
        "You should only use __unsafeOverruleSettings in test environment"
      ), O = e;
    }
  ];
}, L = (r) => {
  let d = V(null), o = [];
  const g = () => {
    o.some((n) => n === null) ? d.set(null) : d.set([o.join(""), o]);
  }, S = [];
  for (let n = 0; n < r.length; n++) {
    const s = r[n];
    if (typeof s == "string") {
      o.push(s);
      continue;
    }
    o.push(s.get()), S.push(
      s.listen((w) => {
        o[n] = w, g();
      })
    );
  }
  return g(), [d, () => S.forEach((n) => n())];
}, R = () => new Date().getTime(), T = (r) => setTimeout(r);
export {
  A as nanofetch
};
