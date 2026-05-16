import { ImageResponse } from "next/og"

export const size = {
  width: 180,
  height: 180,
}

export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#ffffff",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            background: "#000000",
            borderRadius: 9999,
            height: 148,
            overflow: "hidden",
            position: "relative",
            width: 148,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #f6e08e 0%, #cc8208 100%)",
              borderRadius: "0 44px 44px 0",
              height: 42,
              left: 40,
              position: "absolute",
              top: 28,
              width: 78,
            }}
          />
          <div
            style={{
              background: "linear-gradient(135deg, #f6e08e 0%, #cc8208 100%)",
              borderRadius: 9999,
              height: 31,
              left: 40,
              position: "absolute",
              top: 84,
              width: 31,
            }}
          />
          <div
            style={{
              background: "linear-gradient(135deg, #f6e08e 0%, #cc8208 100%)",
              borderRadius: "0 44px 44px 0",
              height: 40,
              left: 74,
              position: "absolute",
              top: 78,
              width: 62,
            }}
          />
        </div>
      </div>
    ),
    size
  )
}