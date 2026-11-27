import { ImageResponse } from 'next/og';

export const runtime = 'nodejs';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function HomeOpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px',
          background: '#09090B',
          color: '#FAFAFA',
          fontFamily: 'sans-serif',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: '#141417',
            border: '2px solid #27272A',
            borderRadius: '32px',
            padding: '52px',
            position: 'relative',
          }}
        >
          {/* Header with MatchMate SVG Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
              <svg width="64" height="64" viewBox="0 0 40 40" fill="none">
                <rect
                  x="1.25"
                  y="1.25"
                  width="37.5"
                  height="37.5"
                  rx="10"
                  fill="#09090B"
                  stroke="#B4F000"
                  strokeOpacity="0.45"
                  strokeWidth="1.5"
                />
                <rect
                  x="5.5"
                  y="5.5"
                  width="29"
                  height="29"
                  rx="6"
                  stroke="#B4F000"
                  strokeOpacity="0.22"
                  strokeWidth="1"
                />
                <path
                  d="M10.5 30V12L20 23L29.5 12V30"
                  stroke="#B4F000"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M20 7.5L21.2 10.6L24.3 11.8L21.2 13L20 16.1L18.8 13L15.7 11.8L18.8 10.6L20 7.5Z"
                  fill="#D9FF33"
                />
              </svg>
              <div style={{ display: 'flex', fontSize: '40px', fontWeight: 800 }}>
                <span style={{ color: '#FFFFFF' }}>Match</span>
                <span style={{ color: '#B4F000' }}>Mate</span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 22px',
                borderRadius: '999px',
                background: '#B4F000',
                color: '#09090B',
                fontSize: '20px',
                fontWeight: 800,
              }}
            >
              VIETQR
            </div>
          </div>

          {/* Center headline */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div
              style={{
                fontSize: '60px',
                fontWeight: 800,
                lineHeight: 1.12,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
              }}
            >
              ĐẶT GIỮ CHỖ SÂN THỂ THAO
            </div>
            <div style={{ fontSize: '30px', color: '#A1A1AA', fontWeight: 500 }}>
              Giữ chỗ ngay · Thanh toán VietQR · Không cần tài khoản
            </div>
          </div>

          {/* Perforated bottom stub */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              borderTop: '2px dashed #27272A',
              paddingTop: '28px',
              fontSize: '24px',
              fontWeight: 700,
            }}
          >
            <span style={{ color: '#B4F000' }}>CẦU LÔNG · PICKLEBALL · TENNIS</span>
            <span style={{ color: '#71717A' }}>matchmate.app</span>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
