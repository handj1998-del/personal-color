import { synthFace, paperFrame } from './synth.mjs';
import { WB_TARGET_LIN } from '../js/color.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
mkdirSync('media', { recursive: true }); // v2.3.1: 폴더가 없어도 동작
const W = 640, H = 480;
const rgb = (img) => { const o = Buffer.alloc(W * H * 3); for (let i = 0; i < W * H; i++) { o[i * 3] = img.data[i * 4]; o[i * 3 + 1] = img.data[i * 4 + 1]; o[i * 3 + 2] = img.data[i * 4 + 2]; } return o; };
function video(name, frames) {
  writeFileSync(`media/${name}.rgb`, Buffer.concat(frames));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${W}x${H}`, '-r', '10', '-i', `media/${name}.rgb`,
    '-vf', 'scale=out_color_matrix=bt601:out_range=tv', '-pix_fmt', 'yuv420p', `media/${name}.y4m`]);
}
const YELLOW = [1.0, 0.9, 0.62];
const rep = (f, n) => Array(n).fill(f);
const warm = rgb(synthFace({ W, H, skin: [64, 9, 22], hair: [20, 4, 9] }));
const cool = rgb(synthFace({ W, H, skin: [64, 13, 11.5], hair: [14, 0, -1] }));
video('warm', rep(warm, 10));
video('cool', rep(cool, 10));
video('dark', rep(rgb(synthFace({ W, H, skin: [64, 9, 22], illum: [0.1, 0.1, 0.1] })), 10));
const paperY = rgb(paperFrame({ W, H, illum: YELLOW, paperLin: WB_TARGET_LIN }));
const coolY = rgb(synthFace({ W, H, skin: [64, 13, 11.5], hair: [14, 0, -1], illum: YELLOW }));
video('yellow_calib', [...rep(paperY, 40), ...rep(coolY, 40)]); // 4초 종이 → 4초 얼굴 반복
video('yellow_face', rep(coolY, 10));
// v2.3.1: 실제 얼굴 사진(portrait.jpg) → 가짜 카메라 영상 (e2e 'portrait' 단계·live 스위트용, 640×800)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-i', 'portrait.jpg', '-t', '1', '-r', '10',
  '-vf', 'scale=640:800:force_original_aspect_ratio=increase,crop=640:800,scale=out_color_matrix=bt601:out_range=tv', '-pix_fmt', 'yuv420p', 'media/portrait.y4m']);
console.log('ok');
