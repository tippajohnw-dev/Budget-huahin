import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "expense-tracker-data-v1";

const COLORS = {
  bg: "#0f0f13",
  surface: "#1a1a22",
  card: "#22222e",
  border: "#2e2e3e",
  accent: "#f0c040",
  accentDim: "#f0c04022",
  text: "#f0ede8",
  textMuted: "#8b8a9b",
  green: "#4ade80",
  red: "#f87171",
  blue: "#60a5fa",
};

const fmt = (n) =>
  new Intl.NumberFormat("th-TH", { style: "currency", currency: "THB", maximumFractionDigits: 0 }).format(n);

const today = () => new Date().toISOString().split("T")[0];

// ─── Persistent Storage ────────────────────────────────────────────────────
async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? JSON.parse(r.value) : { members: [], expenses: [] };
  } catch {
    return { members: [], expenses: [] };
  }
}
async function saveData(data) {
  try {
    await window.storage.set(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("save failed", e);
  }
}

// ─── Settlement calculation ────────────────────────────────────────────────
function calcSettlement(members, expenses) {
  const balance = {};
  members.forEach((m) => (balance[m] = 0));

  expenses.forEach(({ payer, amount, participants }) => {
    if (!participants.length) return;
    const share = amount / participants.length;
    participants.forEach((p) => {
      if (balance[p] !== undefined) balance[p] -= share;
    });
    if (balance[payer] !== undefined) balance[payer] += amount;
  });

  // Simplify debts
  const pos = Object.entries(balance)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  const neg = Object.entries(balance)
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1]);

  const txns = [];
  let i = 0,
    j = 0;
  const p = pos.map(([n, v]) => [n, v]);
  const n = neg.map(([name, v]) => [name, -v]);

  while (i < p.length && j < n.length) {
    const amt = Math.min(p[i][1], n[j][1]);
    if (amt > 0.5)
      txns.push({ from: n[j][0], to: p[i][0], amount: Math.round(amt) });
    p[i][1] -= amt;
    n[j][1] -= amt;
    if (p[i][1] < 0.5) i++;
    if (n[j][1] < 0.5) j++;
  }

  return { balance, txns };
}

// ─── Components ────────────────────────────────────────────────────────────
function Tag({ children, color = COLORS.accent }) {
  return (
    <span
      style={{
        background: color + "22",
        color,
        border: `1px solid ${color}44`,
        borderRadius: 4,
        padding: "1px 7px",
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {children}
    </span>
  );
}

function Avatar({ name, size = 32 }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const hue = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: `hsl(${hue},55%,42%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: size * 0.38,
        fontWeight: 800,
        color: "#fff",
        flexShrink: 0,
        letterSpacing: 0.5,
      }}
    >
      {initials}
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      {label && (
        <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          background: COLORS.bg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          color: COLORS.text,
          padding: "9px 12px",
          fontSize: 14,
          outline: "none",
          transition: "border-color .15s",
          ...props.style,
        }}
        onFocus={(e) => {
          e.target.style.borderColor = COLORS.accent;
          props.onFocus && props.onFocus(e);
        }}
        onBlur={(e) => {
          e.target.style.borderColor = COLORS.border;
          props.onBlur && props.onBlur(e);
        }}
      />
    </div>
  );
}

function Btn({ children, variant = "primary", small, ...props }) {
  const styles = {
    primary: { background: COLORS.accent, color: "#0f0f13", border: "none" },
    ghost: { background: "transparent", color: COLORS.textMuted, border: `1px solid ${COLORS.border}` },
    danger: { background: "#f8717122", color: COLORS.red, border: `1px solid ${COLORS.red}44` },
  };
  return (
    <button
      {...props}
      style={{
        borderRadius: 8,
        padding: small ? "6px 12px" : "10px 18px",
        fontSize: small ? 12 : 14,
        fontWeight: 700,
        cursor: "pointer",
        transition: "opacity .15s, transform .1s",
        letterSpacing: 0.3,
        ...styles[variant],
        ...props.style,
      }}
      onMouseOver={(e) => (e.currentTarget.style.opacity = "0.82")}
      onMouseOut={(e) => (e.currentTarget.style.opacity = "1")}
    >
      {children}
    </button>
  );
}

// ─── Main App ──────────────────────────────────────────────────────────────
export default function App() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("expenses"); // expenses | settle | members
  const [form, setForm] = useState({ date: today(), payer: "", amount: "", description: "", participants: [] });
  const [newMember, setNewMember] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadData().then(setData);
  }, []);

  const persist = useCallback(
    async (next) => {
      setSaving(true);
      await saveData(next);
      setData(next);
      setSaving(false);
    },
    []
  );

  const showToast = (msg, color = COLORS.green) => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2200);
  };

  if (!data) {
    return (
      <div style={{ background: COLORS.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textMuted, fontFamily: "monospace" }}>
        loading...
      </div>
    );
  }

  const { members, expenses } = data;
  const { balance, txns } = calcSettlement(members, expenses);

  const totalSpent = expenses.reduce((s, e) => s + e.amount, 0);
  const perPerson = members.length ? totalSpent / members.length : 0;

  // Add expense
  const handleAdd = async () => {
    if (!form.payer || !form.amount || form.participants.length === 0) {
      showToast("กรุณากรอกข้อมูลให้ครบ", COLORS.red);
      return;
    }
    const next = {
      ...data,
      expenses: [
        ...expenses,
        {
          id: Date.now().toString(),
          date: form.date,
          payer: form.payer,
          amount: parseFloat(form.amount),
          description: form.description,
          participants: form.participants,
        },
      ],
    };
    await persist(next);
    setForm({ date: today(), payer: "", amount: "", description: "", participants: [] });
    showToast("เพิ่มรายการแล้ว ✓");
  };

  const handleDelete = async (id) => {
    await persist({ ...data, expenses: expenses.filter((e) => e.id !== id) });
    showToast("ลบรายการแล้ว", COLORS.textMuted);
  };

  const handleAddMember = async () => {
    const name = newMember.trim();
    if (!name || members.includes(name)) return;
    await persist({ ...data, members: [...members, name] });
    setNewMember("");
    showToast(`เพิ่ม ${name} แล้ว ✓`);
  };

  const handleRemoveMember = async (name) => {
    await persist({ ...data, members: members.filter((m) => m !== name) });
  };

  const toggleParticipant = (name) => {
    setForm((f) => ({
      ...f,
      participants: f.participants.includes(name)
        ? f.participants.filter((p) => p !== name)
        : [...f.participants, name],
    }));
  };

  const selectAllParticipants = () => {
    setForm((f) => ({ ...f, participants: members.length === f.participants.length ? [] : [...members] }));
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const s = {
    root: {
      background: COLORS.bg,
      minHeight: "100vh",
      fontFamily: "'DM Sans', 'Noto Sans Thai', sans-serif",
      color: COLORS.text,
      maxWidth: 520,
      margin: "0 auto",
      padding: "0 0 80px",
    },
    header: {
      padding: "28px 20px 16px",
      borderBottom: `1px solid ${COLORS.border}`,
    },
    tabBar: {
      display: "flex",
      borderBottom: `1px solid ${COLORS.border}`,
      background: COLORS.surface,
      position: "sticky",
      top: 0,
      zIndex: 10,
    },
    card: {
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    },
  };

  const TabBtn = ({ id, label }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        flex: 1,
        padding: "13px 0",
        background: "none",
        border: "none",
        color: tab === id ? COLORS.accent : COLORS.textMuted,
        fontWeight: tab === id ? 800 : 500,
        fontSize: 13,
        cursor: "pointer",
        borderBottom: `2px solid ${tab === id ? COLORS.accent : "transparent"}`,
        transition: "all .15s",
        letterSpacing: 0.3,
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={s.root}>
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: toast.color, color: "#fff", borderRadius: 8, padding: "10px 20px",
          fontSize: 13, fontWeight: 700, zIndex: 999, boxShadow: "0 4px 20px #0008",
          animation: "fadeIn .2s",
        }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={s.header}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.accent, letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
              Expense Tracker
            </div>
            <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -0.5 }}>หารค่าใช้จ่าย</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: COLORS.textMuted, marginBottom: 2 }}>ยอดรวมทั้งหมด</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: COLORS.accent }}>{fmt(totalSpent)}</div>
            {members.length > 0 && (
              <div style={{ fontSize: 11, color: COLORS.textMuted }}>เฉลี่ยคนละ {fmt(perPerson)}</div>
            )}
          </div>
        </div>

        {/* Member pills */}
        {members.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {members.map((m) => (
              <div key={m} style={{ display: "flex", alignItems: "center", gap: 5, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 20, padding: "3px 10px 3px 5px" }}>
                <Avatar name={m} size={20} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>{m}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={s.tabBar}>
        <TabBtn id="expenses" label="📋 รายการ" />
        <TabBtn id="add" label="➕ เพิ่ม" />
        <TabBtn id="settle" label="💸 หาร" />
        <TabBtn id="members" label="👥 สมาชิก" />
      </div>

      <div style={{ padding: "16px 16px 0" }}>

        {/* ── EXPENSES TAB ── */}
        {tab === "expenses" && (
          <div>
            {expenses.length === 0 ? (
              <div style={{ textAlign: "center", color: COLORS.textMuted, padding: "60px 0", fontSize: 14 }}>
                ยังไม่มีรายการ<br />
                <span style={{ fontSize: 12 }}>กด ➕ เพิ่ม เพื่อบันทึกค่าใช้จ่าย</span>
              </div>
            ) : (
              [...expenses].reverse().map((exp) => (
                <div key={exp.id} style={s.card}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <Avatar name={exp.payer} size={36} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{exp.description || "(ไม่มีรายละเอียด)"}</div>
                        <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
                          {exp.payer} จ่าย · {exp.date}
                        </div>
                        <div style={{ display: "flex", gap: 4, marginTop: 5, flexWrap: "wrap" }}>
                          {exp.participants.map((p) => (
                            <Tag key={p} color={COLORS.blue}>{p}</Tag>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.accent }}>{fmt(exp.amount)}</div>
                      <div style={{ fontSize: 10, color: COLORS.textMuted, marginTop: 2 }}>
                        ÷{exp.participants.length} = {fmt(exp.amount / exp.participants.length)}/คน
                      </div>
                      <Btn variant="danger" small style={{ marginTop: 6 }} onClick={() => handleDelete(exp.id)}>ลบ</Btn>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ── ADD TAB ── */}
        {tab === "add" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {members.length === 0 && (
              <div style={{ background: COLORS.accentDim, border: `1px solid ${COLORS.accent}44`, borderRadius: 10, padding: 14, fontSize: 13, color: COLORS.accent }}>
                ⚠️ กรุณาเพิ่มสมาชิกก่อนที่แท็บ 👥
              </div>
            )}
            <Input label="วันที่" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>ใครจ่าย</label>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {members.map((m) => (
                  <button key={m} onClick={() => setForm({ ...form, payer: m })}
                    style={{
                      display: "flex", alignItems: "center", gap: 6, padding: "6px 12px 6px 6px",
                      borderRadius: 20, border: `2px solid ${form.payer === m ? COLORS.accent : COLORS.border}`,
                      background: form.payer === m ? COLORS.accentDim : COLORS.surface,
                      cursor: "pointer", transition: "all .15s",
                    }}>
                    <Avatar name={m} size={24} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: form.payer === m ? COLORS.accent : COLORS.text }}>{m}</span>
                  </button>
                ))}
              </div>
            </div>
            <Input label="จำนวนเงิน (บาท)" type="number" placeholder="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <Input label="รายละเอียด" placeholder="ค่าอาหาร, ค่า Grab..." value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase" }}>ใครร่วมหาร</label>
                <Btn variant="ghost" small onClick={selectAllParticipants}>
                  {form.participants.length === members.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
                </Btn>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {members.map((m) => {
                  const sel = form.participants.includes(m);
                  return (
                    <button key={m} onClick={() => toggleParticipant(m)}
                      style={{
                        display: "flex", alignItems: "center", gap: 6, padding: "6px 12px 6px 6px",
                        borderRadius: 20, border: `2px solid ${sel ? COLORS.green : COLORS.border}`,
                        background: sel ? "#4ade8022" : COLORS.surface,
                        cursor: "pointer", transition: "all .15s",
                      }}>
                      <Avatar name={m} size={24} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: sel ? COLORS.green : COLORS.text }}>{m}</span>
                      {sel && <span style={{ fontSize: 11, color: COLORS.green }}>✓</span>}
                    </button>
                  );
                })}
              </div>
            </div>
            <Btn onClick={handleAdd} style={{ width: "100%", marginTop: 4 }}>
              {saving ? "กำลังบันทึก..." : "➕ เพิ่มรายการ"}
            </Btn>
          </div>
        )}

        {/* ── SETTLE TAB ── */}
        {tab === "settle" && (
          <div>
            {/* Balance per person */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>ยอดดุลแต่ละคน</div>
              {members.length === 0 ? (
                <div style={{ color: COLORS.textMuted, fontSize: 13 }}>ยังไม่มีสมาชิก</div>
              ) : (
                members.map((m) => {
                  const bal = balance[m] || 0;
                  return (
                    <div key={m} style={{ ...s.card, display: "flex", alignItems: "center", gap: 12 }}>
                      <Avatar name={m} size={38} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700 }}>{m}</div>
                        <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                          จ่ายไปแล้ว {fmt(expenses.filter(e => e.payer === m).reduce((s, e) => s + e.amount, 0))}
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontWeight: 900, fontSize: 16, color: bal >= 0 ? COLORS.green : COLORS.red }}>
                          {bal >= 0 ? "+" : ""}{fmt(bal)}
                        </div>
                        <Tag color={bal >= 0 ? COLORS.green : COLORS.red}>{bal >= 0 ? "ได้รับ" : "ต้องจ่าย"}</Tag>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Settlement instructions */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>วิธีหารให้จบ</div>
              {txns.length === 0 ? (
                <div style={{ ...s.card, color: COLORS.textMuted, fontSize: 13, textAlign: "center" }}>
                  {members.length === 0 ? "ยังไม่มีสมาชิก" : "✅ ทุกคนเท่ากัน ไม่ต้องโอนอะไร"}
                </div>
              ) : (
                txns.map((t, i) => (
                  <div key={i} style={{ ...s.card, display: "flex", alignItems: "center", gap: 10 }}>
                    <Avatar name={t.from} size={32} />
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 700 }}>{t.from}</span>
                      <span style={{ color: COLORS.textMuted, margin: "0 6px" }}>โอนให้</span>
                      <span style={{ fontWeight: 700 }}>{t.to}</span>
                    </div>
                    <div style={{ fontWeight: 900, fontSize: 16, color: COLORS.accent }}>{fmt(t.amount)}</div>
                    <Avatar name={t.to} size={32} />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ── MEMBERS TAB ── */}
        {tab === "members" && (
          <div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <Input
                placeholder="ชื่อสมาชิก..."
                value={newMember}
                onChange={(e) => setNewMember(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMember()}
                style={{ flex: 1 }}
              />
              <Btn onClick={handleAddMember}>เพิ่ม</Btn>
            </div>
            {members.length === 0 ? (
              <div style={{ color: COLORS.textMuted, fontSize: 13, textAlign: "center", padding: "40px 0" }}>
                ยังไม่มีสมาชิก<br />เพิ่มชื่อเพื่อเริ่มต้น
              </div>
            ) : (
              members.map((m) => (
                <div key={m} style={{ ...s.card, display: "flex", alignItems: "center", gap: 12 }}>
                  <Avatar name={m} size={38} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{m}</div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted }}>
                      {expenses.filter(e => e.participants.includes(m)).length} รายการ
                    </div>
                  </div>
                  <Btn variant="danger" small onClick={() => handleRemoveMember(m)}>ลบ</Btn>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;600;700;900&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        input[type=date]::-webkit-calendar-picker-indicator { filter: invert(0.6); }
        @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(-8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      `}</style>
    </div>
  );
}
