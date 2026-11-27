import { CanvasTexture, SRGBColorSpace } from "three";

/** One printed harbor plan, shared by the angled drawing desk and its pinboard. */
export function garageRoutePlan() {
  const sheet = document.createElement("canvas");
  sheet.width = 768;
  sheet.height = 480;
  const ink = sheet.getContext("2d")!;
  ink.fillStyle = "#33454a";
  ink.fillRect(0, 0, sheet.width, sheet.height);
  ink.lineWidth = 1;
  ink.strokeStyle = "#526165";
  ink.beginPath();
  for (let x = 24; x <= 744; x += 24) { ink.moveTo(x, 24); ink.lineTo(x, 408); }
  for (let y = 24; y <= 408; y += 24) { ink.moveTo(24, y); ink.lineTo(744, y); }
  ink.stroke();
  ink.strokeStyle = "#9fafa7";
  ink.strokeRect(16, 16, 736, 448);
  ink.strokeRect(22, 22, 724, 392);

  // Parallel quay edges, slips, service yards and the inland rail siding.
  ink.save();
  ink.beginPath(); ink.rect(24, 24, 720, 384); ink.clip();
  ink.translate(50, -15); ink.rotate(.26);
  ink.strokeStyle = "#788989";
  for (let x = 50; x < 520; x += 46) {
    ink.strokeRect(x, 4, 13, 59);
    ink.strokeRect(x, 87, 30, 19);
  }
  for (let y = 64; y < 90; y += 8) { ink.beginPath(); ink.moveTo(-30, y); ink.lineTo(720, y); ink.stroke(); }
  for (let x = 40; x < 600; x += 94) {
    for (let y = 144; y < 340; y += 67) ink.strokeRect(x, y, 55, 38);
  }
  ink.restore();

  const route = new Path2D();
  route.moveTo(125, 285);
  route.bezierCurveTo(58, 287, 63, 232, 115, 204);
  route.lineTo(267, 116);
  route.bezierCurveTo(325, 82, 354, 95, 372, 143);
  route.bezierCurveTo(383, 173, 408, 174, 446, 138);
  route.bezierCurveTo(498, 88, 511, 85, 559, 116);
  route.lineTo(657, 180);
  route.bezierCurveTo(713, 216, 669, 251, 639, 239);
  route.lineTo(573, 211);
  route.bezierCurveTo(543, 197, 524, 211, 509, 244);
  route.bezierCurveTo(480, 310, 438, 334, 344, 325);
  route.closePath();
  ink.lineJoin = "round";
  ink.lineWidth = 9; ink.strokeStyle = "#ded8ba"; ink.stroke(route);
  ink.lineWidth = 4; ink.strokeStyle = "#43535a"; ink.stroke(route);
  ink.fillStyle = "#f1cb89";
  ink.fillRect(211, 290, 5, 23);
  ink.font = "bold 16px monospace";
  ink.fillText("HARBOR CIRCUIT", 36, 448);
  ink.font = "13px monospace";
  ink.fillText("PLAN  /  01", 632, 447);
  const map = new CanvasTexture(sheet);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 2;
  return map;
}
