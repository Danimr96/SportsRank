import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#013328",
          color: "#E3DCD2",
          fontSize: 74,
          fontWeight: 700,
          borderRadius: 40,
          letterSpacing: "-0.04em",
        }}
      >
        SR
      </div>
    ),
    size,
  );
}
