import { useState } from "react";

const mockUserData = {
  name: "Amira Hassan",
  postsImported: 487,
  yearsActive: 3,
  topThemes: ["Islamic Calligraphy", "Quran Reflections", "Travel"],
};

/* ════════════════════════════════════════════════════════
   TEMPLATE 1: "The Reflective" — dark, personal, warm
   ════════════════════════════════════════════════════════ */
function ReflectiveStory({ userData, platform }) {
  return (
    <div style={{
      width: 270, height: 480, borderRadius: 16, overflow: "hidden",
      position: "relative",
      background: "linear-gradient(170deg, #0D1117 0%, #0F1D15 45%, #0D1117 100%)",
      flexShrink: 0,
    }}>
      {/* Subtle radial glow */}
      <div style={{
        position: "absolute", top: "30%", left: "50%", transform: "translate(-50%, -50%)",
        width: 300, height: 300, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(10,123,79,0.08) 0%, transparent 70%)",
      }} />

      {/* Top: leaving badge */}
      <div style={{ padding: "28px 22px 0", position: "relative", zIndex: 1 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          background: "rgba(255,255,255,0.05)", borderRadius: 20, padding: "4px 11px",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <div style={{
            width: 5, height: 5, borderRadius: "50%",
            background: platform === "TikTok" ? "#FF0050" : platform === "X / Twitter" ? "#1DA1F2" : "#E4405F",
          }} />
          <span style={{ fontSize: 9, color: "#6E7781", letterSpacing: 1.2, textTransform: "uppercase", fontFamily: "system-ui, sans-serif" }}>
            leaving {platform}
          </span>
        </div>
      </div>

      {/* Avatar */}
      <div style={{ padding: "22px 22px 0", position: "relative", zIndex: 1 }}>
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "linear-gradient(135deg, #0A7B4F, #C8963E)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 17, color: "white", fontWeight: 700, fontFamily: "system-ui, sans-serif",
          border: "2px solid rgba(200,150,62,0.2)",
        }}>
          {userData.name.charAt(0)}
        </div>
      </div>

      {/* Lead line — the hero */}
      <div style={{ padding: "16px 22px 0", position: "relative", zIndex: 1 }}>
        <p style={{
          color: "#E6EDF3", fontSize: 19, lineHeight: 1.4, margin: 0,
          fontFamily: "'Georgia', 'Times New Roman', serif",
          fontWeight: 400,
        }}>
          I found where I actually want to be online.
        </p>
      </div>

      {/* Personal stats line */}
      <div style={{ padding: "14px 22px 0", position: "relative", zIndex: 1 }}>
        <p style={{
          color: "#8B949E", fontSize: 11, lineHeight: 1.6, margin: 0,
          fontFamily: "system-ui, sans-serif",
        }}>
          {userData.yearsActive} years and {userData.postsImported} posts later — I'm moving everything to one place.
        </p>
      </div>

      {/* Thin divider */}
      <div style={{
        margin: "20px 22px", height: 1,
        background: "linear-gradient(90deg, transparent, rgba(200,150,62,0.2), transparent)",
        position: "relative", zIndex: 1,
      }} />

      {/* Mizanly card */}
      <div style={{
        margin: "0 16px", padding: "14px 16px",
        background: "rgba(10,123,79,0.08)", borderRadius: 14,
        border: "1px solid rgba(10,123,79,0.15)",
        position: "relative", zIndex: 1,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 9,
            background: "linear-gradient(135deg, #0A7B4F, #0D9B63)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 13, fontWeight: 900, color: "white", fontFamily: "system-ui, sans-serif",
          }}>M</div>
          <div>
            <div style={{ color: "#E6EDF3", fontSize: 14, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Mizanly</div>
            <div style={{ color: "#6E7781", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>
              Designed with our values in mind.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "20px 16px 22px",
        background: "linear-gradient(transparent, rgba(13,17,23,0.97) 40%)",
        zIndex: 1,
      }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: "#0A7B4F", borderRadius: 12, padding: "11px 0",
          marginBottom: 8,
        }}>
          <span style={{ color: "white", fontSize: 13, fontWeight: 700, fontFamily: "system-ui, sans-serif", letterSpacing: 0.3 }}>
            mizanly.app
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          <span style={{ color: "#6E7781", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>App Store</span>
          <span style={{ color: "#6E7781", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>Google Play</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TEMPLATE 2: "The Bold" — typographic, high contrast
   ════════════════════════════════════════════════════════ */
function BoldStory({ userData, platform }) {
  return (
    <div style={{
      width: 270, height: 480, borderRadius: 16, overflow: "hidden",
      position: "relative", background: "#0D1117", flexShrink: 0,
    }}>
      {/* Accent line top */}
      <div style={{
        position: "absolute", top: 0, left: 0, right: 0, height: 3,
        background: "linear-gradient(90deg, #0A7B4F, #C8963E)",
      }} />

      {/* Leaving badge */}
      <div style={{ padding: "28px 22px 0", position: "relative", zIndex: 1 }}>
        <div style={{
          color: "#6E7781", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase",
          fontFamily: "system-ui, sans-serif",
        }}>
          <span style={{
            display: "inline-block", width: 6, height: 6, borderRadius: "50%", marginRight: 6,
            background: platform === "TikTok" ? "#FF0050" : platform === "X / Twitter" ? "#1DA1F2" : "#E4405F",
            verticalAlign: "middle",
          }} />
          Goodbye {platform}
        </div>
      </div>

      {/* Hero text — big and typographic */}
      <div style={{ padding: "32px 22px 0", position: "relative", zIndex: 1 }}>
        <p style={{
          color: "#FFFFFF", fontSize: 26, lineHeight: 1.25, margin: 0,
          fontFamily: "system-ui, sans-serif", fontWeight: 800,
          letterSpacing: -0.5,
        }}>
          I found
          <br />where I
          <br />actually want
          <br />to be
          <span style={{ color: "#0A7B4F" }}> online.</span>
        </p>
      </div>

      {/* Stats pill */}
      <div style={{ padding: "20px 22px 0", position: "relative", zIndex: 1 }}>
        <div style={{
          display: "inline-flex", gap: 12, alignItems: "center",
          background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 14px",
          border: "1px solid rgba(255,255,255,0.06)",
        }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#E6EDF3", fontSize: 16, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>{userData.postsImported}</div>
            <div style={{ color: "#6E7781", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "system-ui, sans-serif" }}>posts</div>
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#E6EDF3", fontSize: 16, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>{userData.yearsActive}</div>
            <div style={{ color: "#6E7781", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "system-ui, sans-serif" }}>years</div>
          </div>
          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#E6EDF3", fontSize: 16, fontWeight: 800, fontFamily: "system-ui, sans-serif" }}>1</div>
            <div style={{ color: "#6E7781", fontSize: 8, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "system-ui, sans-serif" }}>new home</div>
          </div>
        </div>
      </div>

      {/* Bottom section */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, padding: "0 16px 22px",
        background: "linear-gradient(transparent, #0D1117 30%)",
        zIndex: 1,
      }}>
        {/* Mizanly row */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
          padding: "12px 14px",
          background: "rgba(10,123,79,0.08)", borderRadius: 12,
          border: "1px solid rgba(10,123,79,0.15)",
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: "linear-gradient(135deg, #0A7B4F, #0D9B63)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: 900, color: "white", fontFamily: "system-ui, sans-serif",
          }}>M</div>
          <div>
            <div style={{ color: "#E6EDF3", fontSize: 14, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Mizanly</div>
            <div style={{ color: "#8B949E", fontSize: 9.5, fontFamily: "system-ui, sans-serif" }}>
              Designed with our values in mind.
            </div>
          </div>
        </div>

        {/* CTA */}
        <div style={{
          textAlign: "center",
          background: "#0A7B4F", borderRadius: 12, padding: "11px 0",
          marginBottom: 8,
        }}>
          <span style={{ color: "white", fontSize: 13, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>mizanly.app</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          <span style={{ color: "#6E7781", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>App Store</span>
          <span style={{ color: "#6E7781", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>Google Play</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   TEMPLATE 3: "The Light" — cream, elegant, quiet
   ════════════════════════════════════════════════════════ */
function LightStory({ userData, platform }) {
  return (
    <div style={{
      width: 270, height: 480, borderRadius: 16, overflow: "hidden",
      position: "relative", background: "#FEFCF7", flexShrink: 0,
    }}>
      {/* Subtle pattern */}
      <div style={{
        position: "absolute", inset: 0, opacity: 0.025,
        backgroundImage: `radial-gradient(circle at 20% 50%, rgba(10,123,79,0.4) 1px, transparent 1px)`,
        backgroundSize: "32px 32px",
      }} />

      {/* Leaving badge */}
      <div style={{ padding: "28px 24px 0", position: "relative", zIndex: 1 }}>
        <span style={{
          fontSize: 9, color: "#9CA3AF", letterSpacing: 1.3, textTransform: "uppercase",
          fontFamily: "system-ui, sans-serif",
        }}>
          Moving on from {platform}
        </span>
      </div>

      {/* Hero text */}
      <div style={{
        padding: "28px 24px 0", position: "relative", zIndex: 1,
      }}>
        <p style={{
          color: "#1E293B", fontSize: 21, lineHeight: 1.4, margin: 0,
          fontFamily: "'Georgia', 'Times New Roman', serif",
        }}>
          I found where
          <br />I actually want
          <br />to be online.
        </p>
      </div>

      {/* Personal note */}
      <div style={{ padding: "16px 24px 0", position: "relative", zIndex: 1 }}>
        <p style={{
          color: "#6B7280", fontSize: 11, lineHeight: 1.6, margin: 0,
          fontFamily: "system-ui, sans-serif",
        }}>
          After {userData.yearsActive} years and {userData.postsImported} posts,
          I'm bringing everything to one place.
        </p>
      </div>

      {/* Gold line accent */}
      <div style={{
        margin: "24px 24px", width: 32, height: 2, borderRadius: 1,
        background: "#C8963E", opacity: 0.4, position: "relative", zIndex: 1,
      }} />

      {/* Mizanly section */}
      <div style={{
        padding: "0 24px", position: "relative", zIndex: 1,
        textAlign: "left",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <div style={{
            width: 38, height: 38, borderRadius: 10,
            background: "linear-gradient(135deg, #0A7B4F, #0D9B63)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 900, color: "white", fontFamily: "system-ui, sans-serif",
            boxShadow: "0 2px 12px rgba(10,123,79,0.2)",
          }}>M</div>
          <div>
            <div style={{ color: "#1E293B", fontSize: 15, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>Mizanly</div>
            <div style={{ color: "#9CA3AF", fontSize: 9.5, fontFamily: "system-ui, sans-serif" }}>
              Designed with our values in mind.
            </div>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "20px 20px 22px",
        background: "linear-gradient(transparent, rgba(254,252,247,0.98) 30%)",
        zIndex: 1,
      }}>
        <div style={{
          textAlign: "center",
          background: "#0A7B4F", borderRadius: 12, padding: "11px 0",
          marginBottom: 8,
        }}>
          <span style={{ color: "white", fontSize: 13, fontWeight: 700, fontFamily: "system-ui, sans-serif" }}>mizanly.app</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 16 }}>
          <span style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>App Store</span>
          <span style={{ color: "#D1D5DB" }}>·</span>
          <span style={{ color: "#9CA3AF", fontSize: 9, fontFamily: "system-ui, sans-serif" }}>Google Play</span>
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════ */
const TEMPLATES = [
  { id: "reflective", name: "The Reflective", desc: "Personal & warm" },
  { id: "bold", name: "The Bold", desc: "Typographic & punchy" },
  { id: "light", name: "The Light", desc: "Elegant & quiet" },
];

export default function ExitStoryV2() {
  const [selected, setSelected] = useState("reflective");
  const [platform, setPlatform] = useState("Instagram");

  const renderStory = (id) => {
    const props = { userData: mockUserData, platform };
    if (id === "reflective") return <ReflectiveStory {...props} />;
    if (id === "bold") return <BoldStory {...props} />;
    return <LightStory {...props} />;
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0D1117", color: "#E6EDF3",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      {/* Header */}
      <div style={{ padding: "24px 24px 16px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 8,
            background: "linear-gradient(135deg, #0A7B4F, #C8963E)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 11, fontWeight: 900, color: "white",
          }}>M</div>
          <span style={{ fontSize: 15, fontWeight: 700 }}>Exit Story — v2</span>
        </div>
        <p style={{ color: "#8B949E", fontSize: 12, margin: "8px 0 0", lineHeight: 1.5 }}>
          "I found where I actually want to be online." — Personal. Not an ad. One CTA.
        </p>
      </div>

      {/* Controls */}
      <div style={{ padding: "16px 24px 0" }}>
        <div style={{ color: "#6E7781", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
          Leaving from
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["Instagram", "TikTok", "X / Twitter"].map(p => (
            <button key={p} onClick={() => setPlatform(p)} style={{
              background: platform === p ? "rgba(10,123,79,0.15)" : "rgba(255,255,255,0.03)",
              border: `1px solid ${platform === p ? "rgba(10,123,79,0.3)" : "rgba(255,255,255,0.06)"}`,
              color: platform === p ? "#0D9B63" : "#6E7781",
              borderRadius: 8, padding: "6px 14px", fontSize: 12, cursor: "pointer",
              fontWeight: platform === p ? 600 : 400,
            }}>
              {p}
            </button>
          ))}
        </div>

        <div style={{ color: "#6E7781", fontSize: 9, letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 8 }}>
          Template
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {TEMPLATES.map(t => (
            <button key={t.id} onClick={() => setSelected(t.id)} style={{
              flex: 1, textAlign: "left",
              background: selected === t.id ? "rgba(200,150,62,0.08)" : "rgba(255,255,255,0.02)",
              border: `1px solid ${selected === t.id ? "rgba(200,150,62,0.25)" : "rgba(255,255,255,0.05)"}`,
              borderRadius: 10, padding: "10px 12px", cursor: "pointer",
            }}>
              <div style={{ color: selected === t.id ? "#C8963E" : "#ADBAC7", fontSize: 11, fontWeight: 600 }}>{t.name}</div>
              <div style={{ color: "#6E7781", fontSize: 9, marginTop: 2 }}>{t.desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Story previews — all three side by side */}
      <div style={{
        padding: "24px 24px", display: "flex", gap: 16,
        overflowX: "auto", WebkitOverflowScrolling: "touch",
        scrollbarWidth: "none",
      }}>
        {TEMPLATES.map(t => (
          <div key={t.id} style={{ textAlign: "center", flexShrink: 0 }}>
            <div style={{
              padding: 3, borderRadius: 19, display: "inline-block",
              background: selected === t.id
                ? "linear-gradient(135deg, #0A7B4F, #C8963E)"
                : "rgba(255,255,255,0.06)",
              transition: "all 0.2s ease",
            }}>
              {renderStory(t.id)}
            </div>
            <div style={{
              marginTop: 10,
              color: selected === t.id ? "#C8963E" : "#6E7781",
              fontSize: 10, fontWeight: selected === t.id ? 700 : 400,
              transition: "all 0.2s ease",
            }}>
              {selected === t.id ? `✦ ${t.name}` : t.name}
            </div>
          </div>
        ))}
      </div>

      {/* Message anatomy */}
      <div style={{
        margin: "0 24px 16px", padding: "18px",
        background: "rgba(255,255,255,0.02)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.05)",
      }}>
        <div style={{ color: "#E6EDF3", fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
          Story anatomy
        </div>
        {[
          { n: "1", label: "Platform badge", val: `"Leaving ${platform}" — tiny, top corner. Sets context instantly.` },
          { n: "2", label: "Lead line", val: `"I found where I actually want to be online." — The hook. Feels personal, not promotional.` },
          { n: "3", label: "Personal proof", val: `"${mockUserData.yearsActive} years and ${mockUserData.postsImported} posts" — AI fills from import data. Proves commitment.` },
          { n: "4", label: "Mizanly card", val: `Logo + name + "Designed with our values in mind." — One sentence. No feature dump.` },
          { n: "5", label: "Single CTA", val: `mizanly.app — Universal link. Routes to the right app store automatically.` },
        ].map((item, i) => (
          <div key={i} style={{
            display: "flex", gap: 10, padding: "8px 0",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none",
          }}>
            <div style={{
              width: 20, height: 20, borderRadius: "50%", flexShrink: 0,
              background: "rgba(10,123,79,0.15)", border: "1px solid rgba(10,123,79,0.25)",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "#0D9B63", fontSize: 9, fontWeight: 700,
            }}>{item.n}</div>
            <div>
              <div style={{ color: "#ADBAC7", fontSize: 10, fontWeight: 600 }}>{item.label}</div>
              <div style={{ color: "#6E7781", fontSize: 10, lineHeight: 1.4, marginTop: 2 }}>{item.val}</div>
            </div>
          </div>
        ))}
      </div>

      {/* What's NOT on the story */}
      <div style={{
        margin: "0 24px 24px", padding: "16px 18px",
        background: "rgba(200,150,62,0.04)", borderRadius: 12,
        border: "1px solid rgba(200,150,62,0.1)",
      }}>
        <div style={{ color: "#C8963E", fontSize: 11, fontWeight: 700, marginBottom: 8 }}>
          What we deliberately left out
        </div>
        <div style={{ color: "#8B949E", fontSize: 10, lineHeight: 1.7 }}>
          <span style={{ color: "#6E7781" }}>✕</span> No feature list — "5 spaces" means nothing to a viewer.
          <br />
          <span style={{ color: "#6E7781" }}>✕</span> No negativity about {platform} — this isn't a breakup post.
          <br />
          <span style={{ color: "#6E7781" }}>✕</span> No QR code — ugly and unnecessary when you have a short URL.
          <br />
          <span style={{ color: "#6E7781" }}>✕</span> No "download now" language — the CTA is just the URL, not a command.
          <br />
          <span style={{ color: "#6E7781" }}>✕</span> No pricing or subscription mention — this is a vibe, not a sales page.
        </div>
      </div>
    </div>
  );
}
