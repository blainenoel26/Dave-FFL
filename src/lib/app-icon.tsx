// The app icon artwork, shared by the home-screen icons. Full-bleed: iPhone and Android round the
// corners themselves.
export function AppIconArt({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#1f6f43",
        color: "white",
        fontFamily: "sans-serif",
        fontWeight: 800,
        lineHeight: 1,
      }}
    >
      <div style={{ fontSize: size * 0.2, letterSpacing: size * 0.02 }}>DAVE</div>
      <div style={{ fontSize: size * 0.44, marginTop: size * 0.01 }}>FFL</div>
    </div>
  );
}
