import { atom as j, onStart as Y, onStop as x } from "nanostores";
let z = () => ({
  events: {},
  emit(t, ...o) {
    let n = this.events[t] || [];
    for (let s = 0, l = n.length; s < l; s++)
      n[s](...o);
  },
  on(t, o) {
    var n;
    return (n = this.events[t]) != null && n.push(o) || (this.events[t] = [o]), () => {
      var s;
      this.events[t] = (s = this.events[t]) == null ? void 0 : s.filter((l) => o !== l);
    };
  }
});
const H = ({
  cache: t = /* @__PURE__ */ new Map(),
  fetcher: o,
  ...n
} = {}) => {
  const s = z();
  let l = !0;
  F("focus", () => {
    l = !0, s.emit(1);
  }), F("blur", () => l = !1), F("online", () => s.emit(2));
  const i = /* @__PURE__ */ new Map(), u = /* @__PURE__ */ new Map(), d = /* @__PURE__ */ new Set();
  let M = {};
  const E = async ([e, w], p, c) => {
    if (!l)
      return;
    const { dedupeTime: g = 4e3, fetcher: h } = {
      ...c,
      ...M
    }, a = R();
    t.has(e) || t.set(e, _);
    const f = (r) => {
      (r !== _ || p.get() !== _) && p.set(r);
    };
    b().then(() => {
      const r = t.get(e);
      f(r);
    }), await b();
    const S = u.get(e);
    if (!(S && S + g > a) && !d.has(e)) {
      u.set(e, a), d.add(e);
      try {
        const r = { data: await h(...w), loading: !1 };
        t.set(e, r), f(r), u.set(e, R());
      } catch (r) {
        p.set({ error: r, loading: !1 });
      } finally {
        d.delete(e);
      }
    }
  };
  return [
    (e, {
      fetcher: w = o,
      ...p
    } = {}) => {
      if (process.env.NODE_ENV !== "production" && !w)
        throw new Error(
          "You need to set up either global fetcher of fetcher in createFetcherStore"
        );
      const c = j(), g = { ...n, ...p, fetcher: w };
      let h, a, f, S, r;
      const N = [];
      Y(c, () => {
        const v = !h;
        [r, h] = U(e), S = r.listen((P) => {
          if (P) {
            const [V, L] = P;
            E([V, L], c, g), a = V, f = L;
          } else
            a = f = void 0;
        });
        const m = r.get();
        m ? ([a, f] = m, v && K()) : b().then(() => c.set(_));
        const {
          refetchInterval: D = 0,
          refetchOnFocus: I,
          refetchOnReconnect: T
        } = g, O = () => {
          a && E([a, f], c, g);
        };
        D > 0 && i.set(
          e,
          setInterval(O, D)
        ), I && N.push(s.on(1, O)), T && N.push(s.on(2, O));
      });
      const K = () => {
        a && f && E([a, f], c, g);
      }, y = c.listen;
      return c.listen = (v) => (K(), y(v)), x(c, () => {
        h == null || h(), N.forEach((m) => m()), S();
        const v = i.get(e);
        v && clearInterval(v);
      }), c;
    },
    (e) => {
    },
    (e) => {
      process.env.NODE_ENV !== "test" && console.warn(
        "You should only use __unsafeOverruleSettings in test environment"
      ), M = e;
    }
  ];
}, U = (t) => {
  let o = j(null), n = [];
  const s = () => {
    n.some((i) => i === null) ? o.set(null) : o.set([n.join(""), n]);
  }, l = [];
  for (let i = 0; i < t.length; i++) {
    const u = t[i];
    if (typeof u == "string") {
      n.push(u);
      continue;
    }
    n.push(u.get()), l.push(
      u.listen((d) => {
        n[i] = d, s();
      })
    );
  }
  return s(), [o, () => l.forEach((i) => i())];
}, q = typeof window < "u", F = (t, o) => {
  (!q || process.env.NODE_ENV === "test") && addEventListener(t, o);
}, R = () => new Date().getTime(), b = () => new Promise((t) => t()), _ = Object.freeze({ loading: !0 });
export {
  H as nanofetch
};
