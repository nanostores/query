import { atom as V, onStart as D, onStop as U } from "nanostores";
const A = ({
  cache: r = /* @__PURE__ */ new Map(),
  fetcher: g,
  ...o
} = {}) => {
  const d = /* @__PURE__ */ new Set(), S = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), p = /* @__PURE__ */ new Set();
  let F = {};
  const E = async ([e, l], a, t) => {
    const {
      dedupeTime: i = 4e3,
      fetcher: w,
      refetchOnFocus: s,
      refetchOnReconnect: u,
      refetchInterval: _
    } = { ...t, ...F }, f = R();
    s && d.add(e), u && S.add(e), _ && !n.has(e) && n.set(
      e,
      setInterval(
        () => E([e, l], a, t),
        _
      )
    );
    const v = c.get(e);
    v && v + i > f || p.has(e) || (c.set(e, f), p.add(e), l || console.log(new Error()), w(...l).then((m) => {
      const h = { data: m, loading: !1 };
      r.set(e, h), a.set(h), c.set(e, R());
    }).catch((m) => a.set({ error: m, loading: !1 })).finally(() => p.delete(e)));
  }, O = (e) => {
    !e || (d.delete(e), S.delete(e), clearInterval(n.get(e)));
  }, K = ([e, l], a, t) => {
    if (!r.has(e)) {
      const i = { loading: !0 };
      r.set(e, i);
    }
    T(() => a.set(r.get(e))), E([e, l], a, t);
  };
  return [
    (e, {
      fetcher: l = g,
      ...a
    } = {}) => {
      if (process.env.NODE_ENV !== "production" && !l)
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      const t = V({ loading: !0 }), i = { ...o, ...a, fetcher: l };
      let w, s, u, _, f;
      D(t, () => {
        const h = !w;
        [f, w] = L(e), _ = f.listen((I) => {
          if (O(s), I) {
            const [M, b] = I;
            O(s), K([M, b], t, i), s = M, u = b;
          }
        });
        const N = f.get();
        N ? ([s, u] = N, h && v()) : T(() => t.set({ loading: !0 }));
      });
      const v = () => {
        s && u && K(
          [s, u],
          t,
          i
        );
      }, m = t.listen;
      return t.listen = (h) => (v(), m(h)), U(t, () => {
        w(), _(), O(s);
      }), t;
    },
    (e) => {
    },
    (e) => {
      process.env.NODE_ENV !== "test" && console.warn(
        "You should only use __unsafeOverruleSettings in test environment"
      ), F = e;
    }
  ];
}, L = (r) => {
  let g = V(null), o = [];
  const d = () => {
    o.some((n) => n === null) ? g.set(null) : g.set([o.join(""), o]);
  }, S = [];
  for (let n = 0; n < r.length; n++) {
    const c = r[n];
    if (typeof c == "string") {
      o.push(c);
      continue;
    }
    o.push(c.get()), S.push(
      c.listen((p) => {
        o[n] = p, d();
      })
    );
  }
  return d(), [g, () => S.forEach((n) => n())];
}, R = () => new Date().getTime(), T = (r) => setTimeout(r);
export {
  A as nanofetch
};
