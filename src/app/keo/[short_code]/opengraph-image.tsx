import { ImageResponse } from 'next/og';
import { createClient } from '@supabase/supabase-js';
import { isValidShortCode } from '@/lib/validation';
import { extractMatchTimeRange } from '@/lib/format';
import type { PublicParticipantsPayload } from '@/lib/types';

export const runtime = 'nodejs';
export const revalidate = 60;
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function formatShortViDayTime(iso: string, notes?: string | null): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const parts = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  const month = parts.find((p) => p.type === 'month')?.value ?? '';
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '';
  const compactDay = weekday.replace('Thứ ', 'T').replace('Chủ Nhật', 'CN');
  const parsedRange = extractMatchTimeRange(notes);
  const timeText = parsedRange
    ? `${hour}:${minute} – ${parsedRange.endTime}`
    : `${hour}:${minute}`;
  return `${compactDay} ${day}/${month} · ${timeText}`.trim();
}

export default async function OpenGraphImage({
  params,
}: {
  params: Promise<{ short_code: string }>;
}) {
  const { short_code } = await params;
  const upperCode = short_code.toUpperCase();

  let sport = 'MATCHMATE';
  let title = 'Đặt giữ chỗ sân thể thao';
  let subtitle = 'Xem chỗ trống và thanh toán bằng VietQR';
  let feeLabel = '';
  let taken = 0;
  let maxSlots = 12;
  let available = 12;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && anonKey && isValidShortCode(short_code)) {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: match } = await supabase
      .from('matches')
      .select('id, sport, title, starts_at, location_name, fee_per_slot, max_slots, slots_taken, notes')
      .eq('short_code', upperCode)
      .maybeSingle();

    if (match) {
      const { data: p } = await supabase.rpc('get_public_participants', {
        p_match_id: match.id,
      });
      const payload = p as PublicParticipantsPayload | null;
      taken = payload?.slots_taken ?? match.slots_taken;
      maxSlots = match.max_slots;
      available = payload?.available_slots ?? Math.max(maxSlots - taken, 0);

      const when = formatShortViDayTime(match.starts_at, match.notes);
      sport = String(match.sport || 'SPORT').toUpperCase();
      title = match.title.toUpperCase();
      subtitle = `${when} · ${match.location_name}`;
      feeLabel = `${Number(match.fee_per_slot).toLocaleString('vi-VN')}đ / slot`;
    }
  }

  const pct = maxSlots > 0 ? Math.min(100, Math.round((taken / maxSlots) * 100)) : 0;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '44px',
          background: '#09090B',
          color: '#FAFAFA',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Ticket Surface */}
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            background: '#141417',
            border: '2px solid #27272A',
            borderRadius: '30px',
            padding: '46px 54px',
            position: 'relative',
          }}
        >
          {/* Left & Right Ticket Notches */}
          <div
            style={{
              position: 'absolute',
              left: '-18px',
              top: '360px',
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              background: '#09090B',
              border: '2px solid #27272A',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: '-18px',
              top: '360px',
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              background: '#09090B',
              border: '2px solid #27272A',
            }}
          />

          {/* Top Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <svg width="54" height="54" viewBox="0 0 40 40" fill="none">
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
              <div style={{ display: 'flex', fontSize: '34px', fontWeight: 800 }}>
                <span style={{ color: '#FFFFFF' }}>Match</span>
                <span style={{ color: '#B4F000' }}>Mate</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div
                style={{
                  display: 'flex',
                  padding: '8px 18px',
                  borderRadius: '999px',
                  background: '#1E293B',
                  border: '1px solid #3F3F46',
                  color: '#B4F000',
                  fontSize: '20px',
                  fontWeight: 700,
                }}
              >
                {sport}
              </div>
              <div
                style={{
                  display: 'flex',
                  padding: '8px 18px',
                  borderRadius: '999px',
                  background: '#B4F000',
                  color: '#09090B',
                  fontSize: '20px',
                  fontWeight: 800,
                }}
              >
                #{upperCode}
              </div>
            </div>
          </div>

          {/* Match Title & Meta */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                fontSize: '50px',
                fontWeight: 800,
                lineHeight: 1.15,
                color: '#FFFFFF',
                letterSpacing: '-0.02em',
              }}
            >
              {title}
            </div>
            <div style={{ fontSize: '28px', color: '#A1A1AA' }}>{subtitle}</div>
          </div>

          {/* Perforated Stub Footer */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '18px',
              borderTop: '2px dashed #27272A',
              paddingTop: '24px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '32px', fontWeight: 800, color: '#FFFFFF' }}>
                {feeLabel || 'MatchMate Pass'}
              </span>
              <span style={{ fontSize: '28px', fontWeight: 700, color: '#B4F000' }}>
                Còn {available}/{maxSlots} chỗ ({taken}/{maxSlots})
              </span>
            </div>

            {/* Volt occupancy bar */}
            <div
              style={{
                width: '100%',
                height: '14px',
                borderRadius: '999px',
                background: '#27272A',
                display: 'flex',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${pct}%`,
                  height: '100%',
                  borderRadius: '999px',
                  background: '#B4F000',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
