import { atom as V, onStart as D, onStop as U } from "nanostores";
const x = ({
  cache: r = /* @__PURE__ */ new Map(),
  fetcher: d,
  ...o
} = {}) => {
  const g = /* @__PURE__ */ new Set(), S = /* @__PURE__ */ new Set(), n = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), p = /* @__PURE__ */ new Set();
  let F = {};
  const E = async ([e, l], a, t) => {
    const {
      dedupeTime: i = 4e3,
      fetcher: w,
      refetchOnFocus: s,
      refetchOnReconnect: u,
      refetchInterval: _
    } = { ...t, ...F }, f = R();
    s && g.add(e), u && S.add(e), _ && !n.has(e) && n.set(
      e,
      setInterval(
        () => E([e, l], a, t),
        _
      )
    );
    const v = c.get(e);
    if (!(v && v + i > f) && !p.has(e)) {
      c.set(e, f), p.add(e);
      try {
        const h = { data: await w(...l), loading: !1 };
        r.set(e, h), a.set(h), c.set(e, R());
      } catch (h) {
        a.set({ error: h, loading: !1 });
      } finally {
        p.delete(e);
      }
    }
  }, m = (e) => {
    !e || (g.delete(e), S.delete(e), clearInterval(n.get(e)));
  }, K = ([e, l], a, t) => {
    if (!r.has(e)) {
      const i = { loading: !0 };
      r.set(e, i);
    }
    T(() => a.set(r.get(e))), E([e, l], a, t);
  };
  return [
    (e, {
      fetcher: l = d,
      ...a
    } = {}) => {
      if (process.env.NODE_ENV !== "production" && !l)
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      const t = V({ loading: !0 }), i = { ...o, ...a, fetcher: l };
      let w, s, u, _, f;
      D(t, () => {
        const O = !w;
        [f, w] = L(e), _ = f.listen((I) => {
          if (m(s), I) {
            const [M, b] = I;
            m(s), K([M, b], t, i), s = M, u = b;
          }
        });
        const N = f.get();
        N ? ([s, u] = N, O && v()) : T(() => t.set({ loading: !0 }));
      });
      const v = () => {
        s && u && K(
          [s, u],
          t,
          i
        );
      }, h = t.listen;
      return t.listen = (O) => (v(), h(O)), U(t, () => {
        w(), _(), m(s);
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
  let d = V(null), o = [];
  const g = () => {
    o.some((n) => n === null) ? d.set(null) : d.set([o.join(""), o]);
  }, S = [];
  for (let n = 0; n < r.length; n++) {
    const c = r[n];
    if (typeof c == "string") {
      o.push(c);
      continue;
    }
    o.push(c.get()), S.push(
      c.listen((p) => {
        o[n] = p, g();
      })
    );
  }
  return g(), [d, () => S.forEach((n) => n())];
}, R = () => new Date().getTime(), T = (r) => setTimeout(r);
export {
  x as nanofetch
};
