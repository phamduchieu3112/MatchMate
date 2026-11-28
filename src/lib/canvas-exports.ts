import QRCode from 'qrcode';
import { expandRosterForPoster } from '@/lib/ui-helpers';
import type { PlayerLeaderboardRow } from '@/lib/types';

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(err);
    img.src = src;
  });
}

function drawMatchMateBrand(ctx: CanvasRenderingContext2D, x: number, y: number) {
  drawRoundedRect(ctx, x, y, 48, 48, 12);
  ctx.fillStyle = '#09090B';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(180,240,0,0.6)';
  ctx.stroke();

  ctx.strokeStyle = '#B4F000';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x + 13, y + 36);
  ctx.lineTo(x + 13, y + 15);
  ctx.lineTo(x + 24, y + 27);
  ctx.lineTo(x + 35, y + 15);
  ctx.lineTo(x + 35, y + 36);
  ctx.stroke();

  ctx.font = '900 30px system-ui, -apple-system, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Match', x + 64, y + 34);
  const matchW = ctx.measureText('Match').width;
  ctx.fillStyle = '#B4F000';
  ctx.fillText('Mate', x + 64 + matchW, y + 34);
}

export interface RecapCardRenderInput {
  matchTitle: string;
  sport: string;
  shortCode: string;
  dateTimeText: string;
  locationName: string;
  totalGames: number;
  leaderboard: PlayerLeaderboardRow[];
  mvp: PlayerLeaderboardRow | null;
}

/**
 * Renders a crisp 1080x1350 dark-volt Match Recap Card PNG data URL for Zalo/social sharing.
 */
export async function renderMatchRecapCardPng(
  input: RecapCardRenderInput
): Promise<string> {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(540, 120, 40, 540, 120, 640);
  glow.addColorStop(0, 'rgba(180, 240, 0, 0.14)');
  glow.addColorStop(1, 'rgba(9, 9, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 640);

  drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 36);
  ctx.fillStyle = '#141417';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#27272A';
  ctx.stroke();

  drawRoundedRect(ctx, 40, 40, width - 80, 10, 5);
  ctx.fillStyle = '#B4F000';
  ctx.fill();

  drawMatchMateBrand(ctx, 84, 86);

  const badgeText = `#${input.shortCode}`;
  ctx.font = '800 22px ui-monospace, monospace';
  const badgeW = ctx.measureText(badgeText).width + 36;
  drawRoundedRect(ctx, width - 84 - badgeW, 90, badgeW, 44, 22);
  ctx.fillStyle = '#B4F000';
  ctx.fill();
  ctx.fillStyle = '#09090B';
  ctx.fillText(badgeText, width - 84 - badgeW + 18, 120);

  const sportText = input.sport.toUpperCase();
  ctx.font = '800 20px system-ui, sans-serif';
  const sportW = ctx.measureText(sportText).width + 34;
  drawRoundedRect(ctx, width - 84 - badgeW - 14 - sportW, 90, sportW, 44, 22);
  ctx.fillStyle = '#27272A';
  ctx.fill();
  ctx.fillStyle = '#B4F000';
  ctx.fillText(sportText, width - 84 - badgeW - 14 - sportW + 17, 119);

  ctx.font = '800 20px system-ui, sans-serif';
  ctx.fillStyle = '#B4F000';
  ctx.fillText('TỔNG KẾT BUỔI ĐẤU · MATCH RECAP', 84, 194);

  ctx.font = '900 44px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fitText(ctx, input.matchTitle.toUpperCase(), 912), 84, 250);

  ctx.font = '600 24px system-ui, sans-serif';
  ctx.fillStyle = '#A1A1AA';
  ctx.fillText(
    fitText(ctx, `${input.dateTimeText} · ${input.locationName}`, 912),
    84,
    294
  );

  drawRoundedRect(ctx, 84, 332, 912, 162, 24);
  ctx.fillStyle = '#18181B';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(180, 240, 0, 0.55)';
  ctx.stroke();

  ctx.font = '900 18px system-ui, sans-serif';
  ctx.fillStyle = '#B4F000';
  ctx.fillText('★ MVP BUỔI CHƠI', 116, 376);

  if (input.mvp) {
    ctx.font = '900 42px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(fitText(ctx, input.mvp.name, 540), 116, 434);

    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillStyle = '#D4D4D8';
    const diffPrefix = input.mvp.pointDiff >= 0 ? '+' : '';
    ctx.fillText(
      `${input.mvp.wins} Thắng · ${input.mvp.losses} Thua · Hiệu số ${diffPrefix}${input.mvp.pointDiff}`,
      116,
      472
    );

    const wrText = `${input.mvp.winRate}% WIN`;
    drawRoundedRect(ctx, 780, 374, 184, 78, 18);
    ctx.fillStyle = '#B4F000';
    ctx.fill();
    ctx.font = '900 28px system-ui, sans-serif';
    ctx.fillStyle = '#09090B';
    const wrW = ctx.measureText(wrText).width;
    ctx.fillText(wrText, 780 + (184 - wrW) / 2, 423);
  } else {
    ctx.font = '700 28px system-ui, sans-serif';
    ctx.fillStyle = '#A1A1AA';
    ctx.fillText('Chưa có trận đấu nào hoàn tất', 116, 434);
  }

  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(`BẢNG XẾP HẠNG (${input.totalGames} TRẬN)`, 84, 548);

  drawRoundedRect(ctx, 84, 568, 912, 46, 12);
  ctx.fillStyle = '#27272A';
  ctx.fill();

  ctx.font = '800 18px system-ui, sans-serif';
  ctx.fillStyle = '#A1A1AA';
  ctx.fillText('#', 108, 597);
  ctx.fillText('NGƯỜI CHƠI', 164, 597);
  ctx.fillText('TRẬN', 610, 597);
  ctx.fillText('T - B', 705, 597);
  ctx.fillText('WIN%', 810, 597);
  ctx.fillText('+/-', 915, 597);

  const topRows = input.leaderboard.slice(0, 8);
  let y = 632;
  for (let i = 0; i < topRows.length; i += 1) {
    const row = topRows[i];
    drawRoundedRect(ctx, 84, y, 912, 68, 14);
    ctx.fillStyle = i === 0 ? 'rgba(180,240,0,0.08)' : '#0F0F12';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = i === 0 ? 'rgba(180,240,0,0.4)' : '#27272A';
    ctx.stroke();

    ctx.font = '900 22px ui-monospace, monospace';
    ctx.fillStyle = i === 0 ? '#B4F000' : '#71717A';
    ctx.fillText(`${i + 1}`, 108, y + 42);

    ctx.font = '800 24px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(fitText(ctx, row.name, 420), 164, y + 42);

    ctx.font = '700 22px ui-monospace, monospace';
    ctx.fillStyle = '#D4D4D8';
    ctx.fillText(`${row.gamesPlayed}`, 622, y + 42);
    ctx.fillText(`${row.wins}-${row.losses}`, 702, y + 42);
    ctx.fillStyle = '#B4F000';
    ctx.fillText(`${row.winRate}%`, 810, y + 42);

    const diffStr = `${row.pointDiff >= 0 ? '+' : ''}${row.pointDiff}`;
    ctx.fillStyle = row.pointDiff >= 0 ? '#34D399' : '#FB7185';
    ctx.fillText(diffStr, 912, y + 42);

    y += 78;
  }

  ctx.strokeStyle = '#27272A';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(84, 1260);
  ctx.lineTo(996, 1260);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = '#71717A';
  ctx.fillText('MatchMate · Thẻ tổng kết sân đấu', 84, 1296);

  return canvas.toDataURL('image/png');
}

export interface RosterPosterRenderInput {
  matchTitle: string;
  sport: string;
  shortCode: string;
  dateTimeText: string;
  locationName: string;
  courtNumbers?: string | null;
  level?: string | null;
  feeText: string;
  slotsTaken: number;
  maxSlots: number;
  roster: Array<{ displayName: string; slots: number; status: string }>;
  bookingUrl: string;
}

/**
 * Renders a crisp 1080x1350 dark-volt Roster Poster PNG with a scannable QR code
 * linking directly to the session booking page.
 */
export async function renderRosterPosterPng(
  input: RosterPosterRenderInput
): Promise<string> {
  const width = 1080;
  const height = 1350;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');

  ctx.fillStyle = '#09090B';
  ctx.fillRect(0, 0, width, height);

  const glow = ctx.createRadialGradient(840, 180, 40, 840, 180, 620);
  glow.addColorStop(0, 'rgba(180, 240, 0, 0.16)');
  glow.addColorStop(1, 'rgba(9, 9, 11, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, 640);

  drawRoundedRect(ctx, 40, 40, width - 80, height - 80, 36);
  ctx.fillStyle = '#141417';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#27272A';
  ctx.stroke();

  drawRoundedRect(ctx, 40, 40, width - 80, 10, 5);
  ctx.fillStyle = '#B4F000';
  ctx.fill();

  drawMatchMateBrand(ctx, 84, 84);

  const codeText = `#${input.shortCode}`;
  ctx.font = '800 22px ui-monospace, monospace';
  const codeW = ctx.measureText(codeText).width + 36;
  drawRoundedRect(ctx, width - 84 - codeW, 88, codeW, 44, 22);
  ctx.fillStyle = '#B4F000';
  ctx.fill();
  ctx.fillStyle = '#09090B';
  ctx.fillText(codeText, width - 84 - codeW + 18, 118);

  const sportText = input.sport.toUpperCase();
  ctx.font = '800 20px system-ui, sans-serif';
  const sportW = ctx.measureText(sportText).width + 34;
  drawRoundedRect(ctx, width - 84 - codeW - 14 - sportW, 88, sportW, 44, 22);
  ctx.fillStyle = '#27272A';
  ctx.fill();
  ctx.fillStyle = '#B4F000';
  ctx.fillText(sportText, width - 84 - codeW - 14 - sportW + 17, 117);

  ctx.font = '900 46px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(fitText(ctx, input.matchTitle.toUpperCase(), 912), 84, 206);

  ctx.font = '700 25px system-ui, sans-serif';
  ctx.fillStyle = '#E4E4E7';
  ctx.fillText(fitText(ctx, `🕒 ${input.dateTimeText}`, 912), 84, 254);
  ctx.fillStyle = '#A1A1AA';
  const locLine = input.courtNumbers
    ? `📍 ${input.locationName} · Sân ${input.courtNumbers}`
    : `📍 ${input.locationName}`;
  ctx.fillText(fitText(ctx, locLine, 912), 84, 294);

  const metaParts = [
    input.feeText,
    `Chỗ: ${input.slotsTaken}/${input.maxSlots}`,
    ...(input.level ? [`Trình: ${input.level}`] : []),
  ];
  let chipX = 84;
  ctx.font = '800 20px system-ui, sans-serif';
  for (const part of metaParts) {
    const w = ctx.measureText(part).width + 32;
    drawRoundedRect(ctx, chipX, 324, w, 42, 21);
    ctx.fillStyle = '#27272A';
    ctx.fill();
    ctx.fillStyle = '#B4F000';
    ctx.fillText(part, chipX + 16, 352);
    chipX += w + 12;
  }

  const pct =
    input.maxSlots > 0
      ? Math.min(1, Math.max(0, input.slotsTaken / input.maxSlots))
      : 0;
  drawRoundedRect(ctx, 84, 386, 912, 14, 7);
  ctx.fillStyle = '#27272A';
  ctx.fill();
  if (pct > 0) {
    drawRoundedRect(ctx, 84, 386, Math.max(20, 912 * pct), 14, 7);
    ctx.fillStyle = '#B4F000';
    ctx.fill();
  }

  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(
    `DANH SÁCH THAM GIA (${input.slotsTaken}/${input.maxSlots})`,
    84,
    448
  );

  const expandedRoster = expandRosterForPoster(input.roster);
  const visibleRoster = expandedRoster.slice(0, 14);
  const colWidth = 444;
  for (let i = 0; i < visibleRoster.length; i += 1) {
    const item = visibleRoster[i];
    const col = i % 2;
    const row = Math.floor(i / 2);
    const rx = 84 + col * (colWidth + 24);
    const ry = 468 + row * 68;

    drawRoundedRect(ctx, rx, ry, colWidth, 58, 14);
    ctx.fillStyle = '#0F0F12';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle =
      item.status === 'confirmed' ? 'rgba(180, 240, 0, 0.35)' : '#27272A';
    ctx.stroke();

    ctx.font = '800 18px ui-monospace, monospace';
    ctx.fillStyle = '#B4F000';
    ctx.fillText(`${i + 1}.`, rx + 16, ry + 36);

    const statusTag = item.status === 'confirmed' ? 'ĐÃ ĐÓNG' : 'CHỜ CK';
    const tagText = item.slots > 1 ? `×${item.slots} · ${statusTag}` : statusTag;
    ctx.font = '800 14px system-ui, sans-serif';
    const tagWidth = ctx.measureText(tagText).width;
    ctx.fillStyle = item.status === 'confirmed' ? '#B4F000' : '#FBBF24';
    ctx.fillText(tagText, rx + colWidth - 16 - tagWidth, ry + 35);

    const nameMaxWidth = Math.max(160, colWidth - 52 - tagWidth - 28);
    ctx.font = '700 21px system-ui, sans-serif';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(fitText(ctx, item.displayName, nameMaxWidth), rx + 52, ry + 36);
  }

  if (expandedRoster.length > 14) {
    ctx.font = '700 18px system-ui, sans-serif';
    ctx.fillStyle = '#A1A1AA';
    ctx.fillText(
      `+ ${expandedRoster.length - 14} người chơi khác...`,
      84,
      966
    );
  }

  ctx.strokeStyle = '#27272A';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.beginPath();
  ctx.moveTo(84, 996);
  ctx.lineTo(996, 996);
  ctx.stroke();
  ctx.setLineDash([]);

  const qrDataUrl = await QRCode.toDataURL(input.bookingUrl, {
    width: 240,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#09090B', light: '#FFFFFF' },
  });
  const qrImg = await loadImage(qrDataUrl);

  drawRoundedRect(ctx, 84, 1026, 224, 224, 22);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.drawImage(qrImg, 96, 1038, 200, 200);

  ctx.font = '800 22px system-ui, sans-serif';
  ctx.fillStyle = '#B4F000';
  ctx.fillText('QUÉT MÃ QR ĐỂ ĐẶT SLOT NGAY', 336, 1084);

  ctx.font = '900 34px system-ui, sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('Chốt chỗ nhanh · Thanh toán VietQR', 336, 1134);

  ctx.font = '600 22px ui-monospace, monospace';
  ctx.fillStyle = '#A1A1AA';
  ctx.fillText(fitText(ctx, input.bookingUrl, 660), 336, 1184);

  ctx.font = '700 20px system-ui, sans-serif';
  ctx.fillStyle = '#71717A';
  ctx.fillText('Mở Zalo hoặc Camera để quét trực tiếp', 336, 1226);

  return canvas.toDataURL('image/png');
}

export function downloadDataUrlPng(dataUrl: string, filename: string): void {
  if (typeof document === 'undefined' || !dataUrl) return;
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
