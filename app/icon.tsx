import { ImageResponse } from "next/og"

export const size = {
  width: 512,
  height: 512,
}

export const contentType = "image/png"

export default function Icon() {
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
            display: "flex",
            height: 420,
            overflow: "hidden",
            position: "relative",
            width: 420,
          }}
        >
          <div
            style={{
              background: "linear-gradient(135deg, #f6e08e 0%, #cc8208 100%)",
              borderRadius: "0 120px 120px 0",
              height: 118,
              left: 113,
              position: "absolute",
              top: 86,
              width: 220,
            }}
          />
          <div
            style={{
              background: "linear-gradient(135deg, #f6e08e 0%, #cc8208 100%)",
              borderRadius: 9999,
              height: 88,
              left: 113,
              position: "absolute",
              top: 248,
              width: 88,
            }}
          />
          <div
            style={{
              background: "linear-gradient(135deg, #f6e08e 0%, #cc8208 100%)",
              borderRadius: "0 120px 120px 0",
              height: 112,
              left: 208,
              position: "absolute",
              top: 232,
              width: 172,
            }}
          />
        </div>
      </div>
    ),
    size
  )
}
